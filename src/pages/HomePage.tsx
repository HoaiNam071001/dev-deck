import { api, useLoad } from '../api'
import { fmt, projName, short } from '../lib/format'
import { Link } from '../lib/router'
import { filterRows, group, sum, totalOf } from '../lib/usage'

function readPinned(): number {
  try { const v = JSON.parse(localStorage.getItem('git.pinned') || '[]'); return Array.isArray(v) ? v.length : 0 } catch { return 0 }
}

function ClaudeWidget() {
  const { data, error, loading } = useLoad(api.usage, [])
  const today = data ? filterRows(data, '1', '') : []
  const week = data ? filterRows(data, '7', '') : []
  const top = group(today, (r) => r.project).sort((a, b) => totalOf(b) - totalOf(a))[0]
  return (
    <Link to="/claude" className="widget">
      <div className="widget-h"><span className="widget-ic" aria-hidden="true">✦</span><h2>Claude</h2><span className="widget-go">Mở →</span></div>
      <div className="muted">Token sử dụng</div>
      {loading && !data && <div className="muted">Đang tải…</div>}
      {error && <div className="error-text">{error}</div>}
      {data && (
        <div className="widget-stats">
          <div><div className="kpi-v">{short(totalOf(sum(today)))}</div><div className="kpi-s">hôm nay · {fmt(today.length)} tin</div></div>
          <div><div className="kpi-v">{short(totalOf(sum(week)))}</div><div className="kpi-s">7 ngày qua</div></div>
        </div>
      )}
      {data && <div className="kpi-s truncate">{top ? `Nhiều nhất hôm nay: ${projName(top.k)}` : 'Hôm nay chưa có hoạt động'}</div>}
    </Link>
  )
}

function GitWidget() {
  const cfg = useLoad(api.config, [])
  const pinned = readPinned()
  // Không quét ở đây: quét repo có thể nặng, để người dùng chủ động bấm "Quét" ở trang Git.
  return (
    <Link to="/git" className="widget">
      <div className="widget-h"><span className="widget-ic" aria-hidden="true">⎇</span><h2>Git</h2><span className="widget-go">Mở →</span></div>
      <div className="muted">Quản lý repo</div>
      <div className="widget-stats">
        <div><div className="kpi-v">{cfg.data ? cfg.data.roots.length : '—'}</div><div className="kpi-s">thư mục quét đã chọn</div></div>
        <div><div className="kpi-v">{pinned}</div><div className="kpi-s">repo đã ghim</div></div>
      </div>
      <div className="kpi-s truncate" title={cfg.data?.roots.join(', ')}>{cfg.data ? cfg.data.roots.join(', ') : ''}</div>
    </Link>
  )
}

export function HomePage() {
  return (
    <>
      <div className="toolbar"><h1>DevDeck</h1></div>
      <div className="widgets">
        <ClaudeWidget />
        <GitWidget />
      </div>
    </>
  )
}
