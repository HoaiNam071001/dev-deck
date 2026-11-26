import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, navigate, useRoute, type Route } from '../lib/router'
import { bridge, MOD } from '../lib/platform'
import { getState, openPalette, setState, useStore } from '../lib/store'
import { CommandPalette } from './CommandPalette'
import { Toasts } from './Toasts'
import { Icon } from './ui'

/** Đồng bộ số repo cần chú ý lên khay hệ thống và nhận lệnh từ khay. */
function useDesktopSync() {
  const attention = useStore((s) => s.attention)
  useEffect(() => { bridge()?.setAttention?.(attention) }, [attention])
  useEffect(() => bridge()?.onCommand?.((cmd) => { if (cmd === 'rescan') { setState({ pending: 'rescan' }); navigate('/git') } }), [])
}

const Slots = createContext<{ side: HTMLElement | null; status: HTMLElement | null }>({ side: null, status: null })

/** Nội dung thanh bên riêng của từng trang (dưới phần điều hướng). */
export function SideSlot({ children }: { children: ReactNode }) {
  const { side } = useContext(Slots)
  return side ? createPortal(children, side) : null
}
/** Nội dung thanh trạng thái riêng của từng trang. */
export function StatusSlot({ children }: { children: ReactNode }) {
  const { status } = useContext(Slots)
  return status ? createPortal(children, status) : null
}

const NAV: { to: Route; label: string; icon: string; n: string }[] = [
  { to: '/', label: 'Tổng quan', icon: 'home', n: '1' },
  { to: '/ai', label: 'AI', icon: 'ai', n: '2' },
  { to: '/git', label: 'Git', icon: 'git', n: '3' },
]

function TitleBar() {
  const scanning = useStore((s) => s.scanning)
  const b = bridge()
  return (
    <header className={'titlebar' + (b?.platform === 'darwin' ? ' mac' : '')}>
      <div className="tb-brand"><span className="logo">D</span><span>DevDeck</span></div>
      <div className="tb-center">
        <button className="tb-search" onClick={() => openPalette()}>
          <Icon name="search" size={13} />Tìm repo, dự án hoặc chạy lệnh…<span className="tb-key">{MOD}K</span>
        </button>
      </div>
      <div className="tb-state"><span className={'dot ' + (scanning ? 'busy' : 'ok')} />{scanning ? 'Đang quét…' : 'Sẵn sàng'}</div>
      {b?.close && (
        <div className="wc-group">
          <button className="wc" aria-label="Thu nhỏ" onClick={() => b.minimize?.()}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg></button>
          <button className="wc" aria-label="Phóng to" onClick={() => b.maximize?.()}><svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" stroke="currentColor" /></svg></button>
          <button className="wc wc-x" aria-label="Đóng" onClick={() => b.close?.()}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0 0 10" stroke="currentColor" /></svg></button>
        </div>
      )}
    </header>
  )
}

function Sidebar({ slotRef }: { slotRef: (el: HTMLElement | null) => void }) {
  const route = useRoute()
  const attention = useStore((s) => s.attention)
  return (
    <aside className="sidebar">
      <nav aria-label="Trang" className="nav-list">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={'nav' + (route === n.to ? ' on' : '')} aria-current={route === n.to ? 'page' : undefined}>
            <Icon name={n.icon} size={15} />{n.label}
            {n.to === '/git' && attention > 0
              ? <span className="nav-badge" title="Repo có thay đổi hoặc lệch remote">{attention}</span>
              : <span className="nav-key">{MOD}{n.n}</span>}
          </Link>
        ))}
      </nav>
      <div className="side-slot" ref={slotRef} />
    </aside>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute()
  useDesktopSync()
  const [side, setSide] = useState<HTMLElement | null>(null)
  const [status, setStatus] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      const go = (to: Route) => { e.preventDefault(); navigate(to) }
      if (k === '1') go('/')
      else if (k === '2') go('/ai')
      else if (k === '3') go('/git')
      else if (k === 'k') { e.preventDefault(); setState({ palette: !getState().palette }) }
      else if (k === 'r') { e.preventDefault(); setState({ pending: 'rescan' }); navigate('/git') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = { '/': 'Tổng quan', '/ai': 'AI', '/git': 'Git' }[route] + ' · DevDeck'
  }, [route])

  return (
    <Slots.Provider value={{ side, status }}>
      <div className="app">
        <TitleBar />
        <div className="body">
          <Sidebar slotRef={setSide} />
          <main className="main">{children}</main>
        </div>
        <footer className="statusbar">
          <div className="sb-slot" ref={setStatus} />
          <span className="mono sb-ver">v{__APP_VERSION__}</span>
        </footer>
        <CommandPalette />
        <Toasts />
      </div>
    </Slots.Provider>
  )
}
