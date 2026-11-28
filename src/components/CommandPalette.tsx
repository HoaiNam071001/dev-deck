import { useEffect, useMemo, useRef, useState } from 'react'
import { MOD } from '../lib/platform'
import { baseName, shortPath, toneColor, toneOf } from '../lib/repo'
import { navigate } from '../lib/router'
import { openPalette, setState, useStore } from '../lib/store'
import { Icon } from './ui'

interface Item { id: string; group: 'Lệnh' | 'Repo'; label: string; hint?: string; dot?: string; run: () => void }

/** Bảng lệnh Ctrl+K: chuyển trang, mở repo, quét lại, fetch tất cả. */
export function CommandPalette() {
  const open = useStore((s) => s.palette)
  return open ? <Palette /> : null
}

function Palette() {
  const repos = useStore((s) => s.repos)
  const pinned = useStore((s) => s.pinned)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const close = () => openPalette(false)

  const items = useMemo<Item[]>(() => {
    const cmd = (id: string, label: string, hint: string | undefined, run: () => void): Item => ({ id, group: 'Lệnh', label, hint, run: () => { openPalette(false); run() } })
    const list: Item[] = [
      cmd('home', 'Mở Tổng quan', MOD + '1', () => navigate('/')),
      cmd('ai', 'Mở AI', MOD + '2', () => navigate('/ai')),
      cmd('git', 'Mở Git', MOD + '3', () => navigate('/git')),
      cmd('jobs', 'Mở Job (tiến trình đang chạy)', MOD + '4', () => navigate('/jobs')),
      cmd('remotes', 'Mở Remotes (MR / PR trên GitLab, GitHub)', MOD + '5', () => navigate('/remotes')),
      cmd('rescan', 'Quét lại repo', MOD + 'R', () => { setState({ pending: 'rescan' }); navigate('/git') }),
      cmd('fetchAll', 'Fetch tất cả repo', undefined, () => { setState({ pending: 'fetchAll' }); navigate('/git') }),
      cmd('pullAll', 'Pull tất cả repo (chỉ repo sạch, chậm hơn remote)', undefined, () => { setState({ pending: 'pullAll' }); navigate('/git') }),
      cmd('cleanup', 'Dọn nhánh đã merge ở mọi repo', undefined, () => { setState({ pending: 'cleanup' }); navigate('/git') }),
    ]
    // Chưa quét lần nào thì chỉ có repo đã ghim (lấy tên từ đường dẫn)
    const known = repos.length ? repos.map((r) => ({ path: r.path, name: r.name, dot: toneColor(toneOf(r)) })) : pinned.map((p) => ({ path: p, name: baseName(p), dot: 'var(--fg-mute)' }))
    const rank = (p: string) => { const i = pinned.indexOf(p); return i < 0 ? 1e9 : i }
    for (const r of [...known].sort((a, b) => rank(a.path) - rank(b.path) || a.name.localeCompare(b.name))) {
      list.push({ id: 'r:' + r.path, group: 'Repo', label: r.name, hint: shortPath(r.path), dot: r.dot, run: () => { openPalette(false); setState({ selected: r.path }); navigate('/git') } })
    }
    return list
  }, [repos, pinned])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (t ? items.filter((i) => (i.label + ' ' + (i.hint ?? '')).toLowerCase().includes(t)) : items).slice(0, 40)
  }, [items, q])

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); shown[sel]?.run() }
  }

  return (
    <div className="palette-wrap" onKeyDown={onKey}>
      <button className="palette-scrim" aria-label="Đóng bảng lệnh" tabIndex={-1} onClick={close} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Bảng lệnh">
        <div className="palette-in">
          <Icon name="search" size={15} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Lệnh" placeholder="Gõ tên repo hoặc lệnh…" role="combobox" aria-expanded="true" aria-controls="palette-list" />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {shown.map((it, i) => (
            <div key={it.id}>
              {(i === 0 || shown[i - 1].group !== it.group) && <div className="nav-label pal-group">{it.group}</div>}
              <button role="option" aria-selected={i === sel} className={'pal-item' + (i === sel ? ' on' : '')} onMouseMove={() => setSel(i)} onClick={it.run}>
                {it.dot && <span className="dot" style={{ background: it.dot }} />}
                {it.label}<span className="pal-hint">{it.hint}</span>
              </button>
            </div>
          ))}
          {!shown.length && <p className="empty">Không có kết quả{repos.length ? '' : ' (mở trang Git để quét repo trước)'}</p>}
        </div>
      </div>
    </div>
  )
}
