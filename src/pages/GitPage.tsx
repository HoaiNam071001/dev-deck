import { useEffect, useMemo, useRef, useState } from 'react'
import { api, useLoad } from '../api'
import { FolderPicker } from '../components/FolderPicker'
import { RepoList, type ViewMode } from '../components/RepoViews'
import { changeCount, isDirty, isOut } from '../lib/repo'
import { usePersisted } from '../lib/persist'
import type { RepoSummary } from '../types'

type Filter = 'all' | 'dirty' | 'sync' | 'clean'
type Sort = 'name' | 'recent' | 'changes'

const MODES: { id: ViewMode; label: string; short: string; icon: string }[] = [
  { id: 'flat', label: 'Danh sách phẳng', short: 'Phẳng', icon: '☰' },
  { id: 'tree', label: 'Cây thư mục', short: 'Cây', icon: '🗂' },
  { id: 'grid', label: 'Lưới', short: 'Lưới', icon: '▦' },
]
const loadMode = (): ViewMode => {
  try { const v = localStorage.getItem('git.viewMode'); if (v === 'flat' || v === 'tree' || v === 'grid') return v } catch { /* bỏ qua */ }
  return 'flat'
}

export function GitPage() {
  const [auto, setAuto] = usePersisted('git.auto', true, (v) => typeof v === 'boolean')
  const force = useRef(false)
  // Mới vào chưa quét: scanned=0 thì không gọi API. Bấm "Quét" mới bắt đầu (và bật tự làm mới).
  const [scanned, setScanned] = useState(0)
  const repos = useLoad(() => { if (!scanned) return Promise.resolve(null); const f = force.current; force.current = false; return api.repos(f) }, [scanned], auto && scanned ? 30000 : 0)
  const cfg = useLoad(api.config, [])
  const recent = cfg.data?.recent ?? [] // server bản cũ có thể chưa trả trường này
  const [roots, setRoots] = useState<string[]>([])
  const [depth, setDepth] = useState(4)
  const [picking, setPicking] = useState(false)
  const [scanErr, setScanErr] = useState('')
  const [starting, setStarting] = useState(false)
  // Điền sẵn lựa chọn lần trước từ server (chỉ một lần, không quét)
  const seeded = useRef(false)
  useEffect(() => {
    if (cfg.data && !seeded.current) { seeded.current = true; setRoots(cfg.data.roots); setDepth(cfg.data.depth) }
  }, [cfg.data])
  const [recentOpen, setRecentOpen] = useState(false)
  const recentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!recentOpen) return
    const h = (e: MouseEvent) => { if (!recentRef.current?.contains(e.target as Node)) setRecentOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [recentOpen])
  const toggleRoot =(p: string) => setRoots((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]))

  const scan = async () => {
    setStarting(true); setScanErr('')
    try {
      const c = await api.saveConfig({ roots, depth }) // server kiểm tra thư mục và cập nhật danh sách gần đây
      setRoots(c.roots); setDepth(c.depth); cfg.reload()
      force.current = true
      if (scanned) repos.reload(); else setScanned(1)
    } catch (e) { setScanErr((e as Error).message) } finally { setStarting(false) }
  }
  const [q, setQ] = usePersisted('git.q', '', (v) => typeof v === 'string')
  const [filter, setFilter] = usePersisted<Filter>('git.filter', 'all', (v) => ['all', 'dirty', 'sync', 'clean'].includes(v as string))
  const [sort, setSort] = usePersisted<Sort>('git.sort', 'name', (v) => ['name', 'recent', 'changes'].includes(v as string))
  // Thứ tự ghim: phần tử đầu = trên cùng. Ghim lại một repo đã ghim sẽ đưa nó lên đầu.
  const [pinOrder, setPinOrder] = usePersisted<string[]>('git.pinned', [], (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'))
  const pin = useMemo(() => ({
    order: pinOrder,
    pin: (p: string) => setPinOrder((l) => [p, ...l.filter((x) => x !== p)]),
    unpin: (p: string) => setPinOrder((l) => l.filter((x) => x !== p)),
  }), [pinOrder, setPinOrder])
  const [open, setOpen] = useState<string | null>(null)
  const [mode, setModeState] = useState<ViewMode>(loadMode)
  const setMode = (m: ViewMode) => { setModeState(m); try { localStorage.setItem('git.viewMode', m) } catch { /* bỏ qua */ } }

  const list = repos.data?.repos ?? []
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const f = list.filter((r) => {
      if (t && !(r.name + ' ' + r.path + ' ' + (r.branch ?? '')).toLowerCase().includes(t)) return false
      if (filter === 'dirty') return isDirty(r)
      if (filter === 'sync') return isOut(r)
      if (filter === 'clean') return !isDirty(r) && !r.error
      return true
    })
    const key = (r: RepoSummary) => (r.lastCommit ? new Date(r.lastCommit.date).getTime() : 0)
    f.sort((a, b) => sort === 'recent' ? key(b) - key(a) : sort === 'changes' ? changeCount(b) - changeCount(a) : a.name.localeCompare(b.name))
    const rank = (r: RepoSummary) => { const i = pinOrder.indexOf(r.path); return i < 0 ? Infinity : i }
    // Repo ghim lên trước theo thứ tự ghim; phần còn lại giữ thứ tự đã sắp xếp (sort ổn định)
    return f.sort((a, b) => { const ra = rank(a), rb = rank(b); return ra === rb ? 0 : ra < rb ? -1 : 1 })
  }, [list, q, filter, sort, pinOrder])

  const dirty = list.filter(isDirty).length
  const out = list.filter(isOut).length

  return (
    <>
      <div className="toolbar">
        <h1>Quản lý Git</h1>
        <div className="controls">
          <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Tự làm mới 30s</label>
        </div>
      </div>

      <div className="card scan-panel">
        <div className="scan-roots">
          <span className="kpi-l">Thư mục quét</span>
          {roots.map((r) => (
            <span key={r} className="root-chip" title={r}>
              <span className="truncate">{r}</span>
              <button aria-label={'Bỏ ' + r} onClick={() => setRoots((l) => l.filter((x) => x !== r))}>✕</button>
            </span>
          ))}
          {!roots.length && <span className="muted">Chưa chọn thư mục nào</span>}
        </div>
        <div className="controls">
          <button onClick={() => setPicking(true)}>📁 Chọn thư mục…</button>
          <div className="recent-pop" ref={recentRef}>
            <button type="button" disabled={!recent.length} aria-expanded={recentOpen} onClick={() => setRecentOpen((o) => !o)}>
              Gần đây ({recent.filter((r) => roots.includes(r)).length}/{recent.length} đã chọn) ▾
            </button>
            {recentOpen && (
              <div className="recent-menu">
                {recent.map((r) => (
                  <label key={r} title={r}>
                    <input type="checkbox" checked={roots.includes(r)} onChange={() => toggleRoot(r)} />
                    <span className="truncate">{r}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="check">Độ sâu <input type="number" min={1} max={8} value={depth} onChange={(e) => setDepth(Number(e.target.value))} /></label>
          <button className="primary" onClick={scan} disabled={starting || repos.loading || !roots.length}>
            {starting || repos.loading ? 'Đang quét…' : scanned ? 'Quét lại' : 'Quét'}
          </button>
        </div>
        {scanErr && <div className="error-text">{scanErr}</div>}
      </div>
      {picking && <FolderPicker start={roots[roots.length - 1] ?? cfg.data?.roots[0] ?? ''} selected={roots} onClose={() => setPicking(false)} onToggle={toggleRoot} />}
      {repos.error && <div className="card error">Lỗi: {repos.error}</div>}

      <div className="kpis">
        <div className="card"><div className="kpi-l">Repo</div><div className="kpi-v">{list.length}</div><div className="kpi-s">trong {repos.data?.roots.length ?? 0} thư mục gốc</div></div>
        <div className="card"><div className="kpi-l">Có thay đổi</div><div className="kpi-v">{dirty}</div><div className="kpi-s">chưa commit</div></div>
        <div className="card"><div className="kpi-l">Lệch remote</div><div className="kpi-v">{out}</div><div className="kpi-s">cần push hoặc pull</div></div>
        <div className="card"><div className="kpi-l">Quét lúc</div><div className="kpi-v kpi-sm">{repos.data ? new Date(repos.data.scannedAt).toLocaleTimeString('vi-VN') : '—'}</div><div className="kpi-s truncate" title={repos.data?.roots.join(', ')}>{repos.data?.roots.join(', ')}</div></div>
      </div>

      <div className="card scroll">
        <div className="filters">
          <input type="search" placeholder="Tìm theo tên, đường dẫn, nhánh…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm repo" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Lọc">
            <option value="all">Tất cả</option><option value="dirty">Có thay đổi</option><option value="sync">Lệch remote</option><option value="clean">Sạch</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp">
            <option value="name">Theo tên</option><option value="recent">Commit mới nhất</option><option value="changes">Nhiều thay đổi nhất</option>
          </select>
          <span className="muted">{shown.length}/{list.length}</span>
          <div className="seg" role="group" aria-label="Kiểu hiển thị">
            {MODES.map((m) => (
              <button key={m.id} className={mode === m.id ? 'active' : ''} aria-pressed={mode === m.id} title={m.label} aria-label={m.label} onClick={() => setMode(m.id)}>{m.icon} <span className="seg-l">{m.short}</span></button>
            ))}
          </div>
        </div>

        <RepoList mode={mode} pin={pin} repos={shown} roots={repos.data?.roots ?? []} open={open} setOpen={setOpen} onChanged={repos.reload}
          empty={!scanned ? 'Chọn thư mục rồi bấm “Quét” để bắt đầu.' : repos.loading ? 'Đang quét…' : list.length ? 'Không có repo khớp bộ lọc' : 'Không tìm thấy repo nào. Thử thư mục khác hoặc tăng độ sâu.'} />
      </div>
    </>
  )
}
