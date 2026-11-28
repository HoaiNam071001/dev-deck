import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, navigate, useRoute, type Route } from '../lib/router'
import { usePersisted } from '../lib/persist'
import { bridge, MOD, type UpdateStatus } from '../lib/platform'
import { getState, openPalette, setState, useStore } from '../lib/store'
import { markRemotesRead, openRemoteCr } from '../lib/remoteWatch'
import { CommandPalette } from './CommandPalette'
import { ReleaseNotesModal } from './ReleaseNotesModal'
import { Toasts } from './Toasts'
import { Icon, Spinner } from './ui'

/** Đồng bộ số repo cần chú ý lên khay hệ thống và nhận lệnh từ khay. */
function useDesktopSync() {
  const attention = useStore((s) => s.attention)
  useEffect(() => { bridge()?.setAttention?.(attention) }, [attention])
  const waiting = useStore((s) => s.reviewQueue.waiting)
  useEffect(() => { bridge()?.setReviewWaiting?.(waiting) }, [waiting])
  useEffect(() => bridge()?.onCommand?.((cmd) => {
    if (cmd === 'rescan') { setState({ pending: 'rescan' }); navigate('/git') }
    else if (cmd === 'open:ai') navigate('/ai')
    else if (cmd.startsWith('open:')) openRemoteCr(cmd.slice(5))
  }), [])
}

/** Nút kiểm tra / cài bản mới trên thanh trạng thái (chỉ có trong app desktop). */
function UpdateButton() {
  const b = bridge()
  const [s, setS] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    let alive = true
    b?.updateStatus?.().then((v) => { if (alive && v) setS(v) }).catch(() => {})
    const off = b?.onUpdateStatus?.(setS)
    return () => { alive = false; off?.() }
  }, [b])
  // Tự về nhãn mặc định sau khi báo "đã là bản mới nhất"
  useEffect(() => {
    if (s.state !== 'none') return
    const t = setTimeout(() => setS({ state: 'idle' }), 6000)
    return () => clearTimeout(t)
  }, [s.state])
  if (!b?.updateCheck) return null

  const busy = s.state === 'checking' || s.state === 'downloading'
  const label = {
    idle: 'Kiểm tra cập nhật', checking: 'Đang kiểm tra…', none: 'Đã là bản mới nhất',
    downloading: `Đang tải ${s.version ?? ''} ${s.percent ?? 0}%`, ready: `Cài ${s.version ?? 'bản mới'} và khởi động lại`,
    error: 'Không kiểm tra được · thử lại', unsupported: 'Kiểm tra cập nhật',
  }[s.state]
  const title = s.state === 'error' ? s.message : s.state === 'unsupported' ? 'Chạy từ mã nguồn nên không tự cập nhật; hãy dùng bản đã đóng gói' : undefined
  const onClick = async () => {
    if (busy) return
    if (s.state === 'ready') { await b.updateInstall?.(); return }
    setS({ state: 'checking' })
    try { setS(await b.updateCheck!()) } catch { setS({ state: 'error' }) }
  }
  return (
    <button className="sb-btn" style={s.state === 'ready' ? { color: 'var(--accent, #30cf43)', fontWeight: 600 } : undefined}
      disabled={busy} title={title} onClick={onClick}>{busy && <Spinner inline />}{busy ? ' ' : ''}{label}</button>
  )
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
  { to: '/jobs', label: 'Job', icon: 'terminal', n: '4' },
  { to: '/remotes', label: 'Remotes', icon: 'merge', n: '5' },
  { to: '/jira', label: 'Jira', icon: 'ticket', n: '6' },
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
      {b?.close && b.platform !== 'darwin' && (   // macOS đã có 3 nút tròn hệ thống ở góc trái
        <div className="wc-group">
          <button className="wc" aria-label="Thu nhỏ" onClick={() => b.minimize?.()}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg></button>
          <button className="wc" aria-label="Phóng to" onClick={() => b.maximize?.()}><svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" stroke="currentColor" /></svg></button>
          <button className="wc wc-x" aria-label="Đóng" onClick={() => b.close?.()}><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0 0 10" stroke="currentColor" /></svg></button>
        </div>
      )}
    </header>
  )
}

const RAIL_W = 48
const SIDE_MIN = 160, SIDE_MAX = 420, SIDE_DEFAULT = 200
const clampW = (w: number) => Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(w)))

function Sidebar({ slotRef }: { slotRef: (el: HTMLElement | null) => void }) {
  const route = useRoute()
  const attention = useStore((s) => s.attention)
  const remoteUnread = useStore((s) => s.remoteUnread)
  const jiraUnread = useStore((s) => s.jiraUnread)
  const waiting = useStore((s) => s.reviewQueue.waiting)
  useEffect(() => { if (route === '/remotes') markRemotesRead() }, [route])
  const cur = NAV.find((n) => n.to === route) ?? NAV[0]
  // Độ rộng panel trái: kéo thanh tách để đổi, nhớ cho lần mở sau; bấm đúp để về mặc định
  const [saved, setSaved] = usePersisted<number>('devdeck.sidebar.w', SIDE_DEFAULT, (v) => typeof v === 'number' && v >= SIDE_MIN && v <= SIDE_MAX)
  const [drag, setDrag] = useState<number | null>(null)
  const w = drag ?? saved
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const left = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().left + RAIL_W
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    let last = w
    const move = (ev: PointerEvent) => { last = clampW(ev.clientX - left); setDrag(last) }
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''; document.body.style.cursor = ''
      setSaved(last); setDrag(null)
    }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
  }
  const keyResize = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSaved(clampW(saved - 16)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSaved(clampW(saved + 16)) }
    else if (e.key === 'Home') { e.preventDefault(); setSaved(SIDE_DEFAULT) }
  }
  return (
    <div className="side">
      {/* Dải icon: chuyển giữa các tab, giống thanh hoạt động của VS Code */}
      <nav aria-label="Trang" className="rail">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={'rail-btn' + (route === n.to ? ' on' : '')} aria-current={route === n.to ? 'page' : undefined}
            aria-label={n.label} title={`${n.label} (${MOD}${n.n})`}>
            <Icon name={n.icon} size={19} />
            {n.to === '/git' && attention > 0 && <span className="rail-badge" title="Repo có thay đổi hoặc lệch remote">{attention}</span>}
            {n.to === '/remotes' && route !== '/remotes' && remoteUnread > 0 && <span className="rail-badge" title="Thread review mới chưa xem">{remoteUnread > 99 ? '99+' : remoteUnread}</span>}
            {n.to === '/jira' && route !== '/jira' && jiraUnread > 0 && <span className="rail-badge" title="Ticket Jira có thay đổi chưa xem">{jiraUnread > 99 ? '99+' : jiraUnread}</span>}
            {n.to === '/remotes' && route !== '/remotes' && remoteUnread === 0 && waiting > 0 && <span className="rail-badge" title="MR / PR đang chờ bạn review">{waiting > 99 ? '99+' : waiting}</span>}
          </Link>
        ))}
      </nav>
      {/* Panel trái: danh sách riêng của tab đang mở (thư mục, repo ghim…) */}
      <aside className="sidebar" aria-label={'Danh sách của ' + cur.label} style={{ width: w }}>
        <div className="side-title">{cur.label}</div>
        <div className="side-slot" ref={slotRef} />
      </aside>
      <div className={'side-resize' + (drag !== null ? ' dragging' : '')} role="separator" aria-orientation="vertical" aria-label="Đổi độ rộng panel trái"
        aria-valuemin={SIDE_MIN} aria-valuemax={SIDE_MAX} aria-valuenow={w} tabIndex={0} title="Kéo để đổi độ rộng · bấm đúp để về mặc định"
        onPointerDown={startDrag} onDoubleClick={() => setSaved(SIDE_DEFAULT)} onKeyDown={keyResize} />
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute()
  useDesktopSync()
  // Số phiên bản thật của app đã đóng gói; ngoài app desktop thì dùng số lúc build
  const [version, setVersion] = useState(__APP_VERSION__)
  useEffect(() => { bridge()?.version?.().then((v) => { if (v) setVersion(v) }).catch(() => {}) }, [])
  const [notesSignal, setNotesSignal] = useState(0)
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
      else if (k === '4') go('/jobs')
      else if (k === '5') go('/remotes')
      else if (k === '6') go('/jira')
      else if (k === 'k') { e.preventDefault(); setState({ palette: !getState().palette }) }
      else if (k === 'r') { e.preventDefault(); setState({ pending: 'rescan' }); navigate('/git') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = { '/': 'Tổng quan', '/ai': 'AI', '/git': 'Git', '/jobs': 'Job', '/remotes': 'Remotes', '/jira': 'Jira' }[route] + ' · DevDeck'
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
          <UpdateButton />
          <button className="ghost mono sb-ver cursor-pointer px-1 hover:text-fg" title="Xem có gì mới trong bản này" onClick={() => setNotesSignal((n) => n + 1)}>v{version}</button>
        </footer>
        <CommandPalette />
        <ReleaseNotesModal version={version} openSignal={notesSignal} />
        <Toasts />
      </div>
    </Slots.Provider>
  )
}
