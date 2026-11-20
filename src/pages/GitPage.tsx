import { useMemo, useRef, useState } from 'react'
import { api, useLoad } from '../api'
import { RepoList, type ViewMode } from '../components/RepoViews'
import { changeCount, isDirty, isOut } from '../lib/repo'
import type { GitConfig, RepoSummary } from '../types'

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

function Settings({ cfg, onSaved, onClose }: { cfg: GitConfig; onSaved: () => void; onClose: () => void }) {
  const [roots, setRoots] = useState(cfg.roots.join('\n'))
  const [depth, setDepth] = useState(cfg.depth)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true); setErr('')
    try {
      await api.saveConfig({ roots: roots.split('\n').map((s) => s.trim()).filter(Boolean), depth })
      onSaved()
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <div className="card settings">
      <h2>Thư mục quét repo</h2>
      <label>Mỗi dòng một thư mục gốc
        <textarea value={roots} onChange={(e) => setRoots(e.target.value)} rows={4} spellCheck={false} />
      </label>
      <label>Độ sâu tối đa
        <input type="number" min={1} max={8} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
      </label>
      {err && <div className="error-text">{err}</div>}
      <div className="controls">
        <button className="primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu và quét lại'}</button>
        <button onClick={onClose}>Đóng</button>
      </div>
    </div>
  )
}

export function GitPage() {
  const [auto, setAuto] = useState(true)
  const force = useRef(false)
  const repos = useLoad(() => { const f = force.current; force.current = false; return api.repos(f) }, [], auto ? 30000 : 0)
  const cfg = useLoad(api.config, [])
  const rescan = () => { force.current = true; repos.reload() }
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [open, setOpen] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
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
    return f.sort((a, b) => sort === 'recent' ? key(b) - key(a) : sort === 'changes' ? changeCount(b) - changeCount(a) : a.name.localeCompare(b.name))
  }, [list, q, filter, sort])

  const dirty = list.filter(isDirty).length
  const out = list.filter(isOut).length

  return (
    <>
      <div className="toolbar">
        <h1>Quản lý Git</h1>
        <div className="controls">
          <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Tự làm mới 30s</label>
          <button onClick={() => setShowSettings((v) => !v)}>Thư mục quét</button>
          <button onClick={rescan} disabled={repos.loading}>{repos.loading ? 'Đang quét…' : 'Quét lại'}</button>
        </div>
      </div>

      {showSettings && cfg.data && (
        <Settings cfg={cfg.data} onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); rescan(); cfg.reload() }} />
      )}
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

        <RepoList mode={mode} repos={shown} roots={repos.data?.roots ?? []} open={open} setOpen={setOpen}
          empty={repos.loading ? 'Đang quét…' : list.length ? 'Không có repo khớp bộ lọc' : 'Không tìm thấy repo nào. Kiểm tra “Thư mục quét”.'} />
      </div>
    </>
  )
}
