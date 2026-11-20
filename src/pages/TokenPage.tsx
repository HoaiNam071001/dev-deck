import { useEffect, useMemo, useState } from 'react'
import { api, useLoad } from '../api'
import { SideSlot, StatusSlot } from '../components/Shell'
import { StackedChart } from '../components/StackedChart'
import { Icon, Kpi, KpiStrip, NavLabel, Segmented, ShareBar } from '../components/ui'
import { dayKey, fmt, projName, short } from '../lib/format'
import { buckets, filterRows, granOf, group, KEYS, sum, totalOf, type Totals } from '../lib/usage'

const RANGES = [
  { id: 'h1', label: '1h', name: '1 giờ qua' }, { id: 'h6', label: '6h', name: '6 giờ qua' }, { id: 'h24', label: '24h', name: '24 giờ qua' },
  { id: '1', label: 'Hôm nay', name: 'Hôm nay' }, { id: '7', label: '7 ngày', name: '7 ngày qua' }, { id: '30', label: '30 ngày', name: '30 ngày qua' },
  { id: '0', label: 'Tất cả', name: 'Toàn bộ' },
]

const p2 = (n: number) => String(n).padStart(2, '0')
const clock = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`

function GroupTable({ title, label, rows, render }: { title: string; label: string; rows: (Totals & { k: string })[]; render: (k: string) => string }) {
  const max = Math.max(1, ...rows.map(totalOf))
  return (
    <section className="panel">
      <h2 className="panel-h">{title}</h2>
      <table className="tbl">
        <thead><tr><th scope="col">{label}</th><th scope="col">Tin</th><th scope="col">In / Out</th><th scope="col">Cache</th><th scope="col" className="w-total">Tổng</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td title={r.k}>{render(r.k)}</td>
              <td className="muted">{fmt(r.msgs)}</td>
              <td>{short(r.input)} / {short(r.output)}</td>
              <td>{short(r.cacheRead + r.cacheWrite)}</td>
              <td><span className="total-cell"><ShareBar pct={(totalOf(r) / max) * 100} /><span>{short(totalOf(r))}</span></span></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="empty">Không có dữ liệu</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

export function TokenPage() {
  const { data, error, loading, reload } = useLoad(api.usage, [], 30000)
  const [range, setRange] = useState('1')
  const [gran, setGran] = useState(0)
  const [project, setProject] = useState('')
  const [readAt, setReadAt] = useState<Date | null>(null)
  useEffect(() => { if (data) setReadAt(new Date()) }, [data])

  const all = data ?? []
  const projects = useMemo(() => [...new Set(all.map((r) => r.project))].sort(), [all])
  const inRange = useMemo(() => filterRows(all, range, ''), [all, range])
  const projTotals = useMemo(() => new Map(group(inRange, (r) => r.project).map((g) => [g.k, totalOf(g)])), [inRange])
  const rows = useMemo(() => (project ? inRange.filter((r) => r.project === project) : inRange), [inRange, project])
  const s = useMemo(() => sum(rows), [rows])
  const g = granOf(gran, range)
  const series = useMemo(() => buckets(rows, g), [rows, g])
  const byTotal = (a: Totals, b: Totals) => totalOf(b) - totalOf(a)
  const byModel = useMemo(() => group(rows, (r) => r.model).sort(byTotal), [rows])
  const byProject = useMemo(() => group(rows, (r) => r.project).sort(byTotal), [rows])

  const total = totalOf(s)
  const hitBase = s.cacheRead + s.cacheWrite + s.input
  const hit = hitBase ? s.cacheRead / hitBase : 0

  // So với hôm qua (cùng khoảng giờ đã trôi qua trong ngày), chỉ khi xem "Hôm nay"
  const delta = useMemo(() => {
    if (range !== '1') return null
    const now = new Date()
    const y0 = new Date(new Date().setHours(0, 0, 0, 0) - 864e5)
    const yNow = new Date(now.getTime() - 864e5)
    const yRows = all.filter((r) => { const t = new Date(r.t); return t >= y0 && t <= yNow && (!project || r.project === project) })
    const yTotal = totalOf(sum(yRows))
    return yTotal ? (total - yTotal) / yTotal : null
  }, [all, range, project, total])

  const exportCsv = () => {
    const head = 'Thời điểm,Input,Output,Cache ghi,Cache đọc,Tin nhắn'
    const lines = series.map((b) => `${dayKey(new Date(b.b))} ${b.time},${b.input},${b.output},${b.cacheWrite},${b.cacheRead},${b.msgs}`)
    const url = URL.createObjectURL(new Blob([[head, ...lines].join('\n')], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `claude-token-${dayKey(new Date())}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const rangeName = RANGES.find((r) => r.id === range)!.name

  return (
    <>
      <SideSlot>
        <div className="side-group">
          <NavLabel>Dự án</NavLabel>
          <button className={'nav-item' + (!project ? ' on' : '')} aria-pressed={!project} onClick={() => setProject('')}>
            Mọi dự án<span className="nav-n">{short(totalOf(sum(inRange)))}</span>
          </button>
          {projects.map((p) => (
            <button key={p} className={'nav-item' + (project === p ? ' on' : '')} aria-pressed={project === p} title={p} onClick={() => setProject(p)}>
              <span className="truncate">{projName(p)}</span><span className="nav-n">{short(projTotals.get(p) ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="side-foot"><span>Nguồn log</span><span className="mono">~/.claude/projects</span></div>
      </SideSlot>
      <StatusSlot>
        <span className="sb-item"><span className={'dot ' + (error ? 'bad' : 'ok')} />Đọc log lúc <span className="mono fg-soft">{readAt ? clock(readAt) : '—'}</span></span>
        <span>{fmt(all.length)} tin · {projects.length} dự án</span>
        <span className="sb-end">Tự làm mới 30s</span>
      </StatusSlot>

      <div className="page">
        <header className="page-h">
          <div className="page-t">
            <h1>Token Claude Code</h1>
            <span className="muted">{rangeName} · {project ? projName(project) : 'mọi dự án'}</span>
          </div>
          <div className="page-tools">
            <Segmented label="Khoảng thời gian" value={range} onChange={setRange} options={RANGES.map(({ id, label }) => ({ id, label }))} />
            <select value={gran} onChange={(e) => setGran(Number(e.target.value))} aria-label="Độ chi tiết">
              <option value="0">Tự động</option><option value="1">1 phút</option><option value="5">5 phút</option>
              <option value="15">15 phút</option><option value="60">Theo giờ</option><option value="1440">Theo ngày</option>
            </select>
            <button className="icon-btn" aria-label="Tải lại" title="Tải lại" onClick={reload} disabled={loading}><Icon name="refresh" size={13} /></button>
            <button className="icon-btn" aria-label="Xuất CSV" title="Xuất CSV" onClick={exportCsv} disabled={!series.length}><Icon name="download" size={13} /></button>
          </div>
        </header>

        {error && <div className="banner err" role="alert">Không đọc được dữ liệu: {error}</div>}

        <KpiStrip label="Chỉ số">
          <Kpi label="Tổng token" value={short(total)}
            sub={delta === null ? `${fmt(total)} token` : <><span style={{ color: delta > 0 ? 'var(--behind)' : 'var(--accent)' }}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(0)}%</span> so với hôm qua</>} />
          <Kpi label="Input + Output" value={short(s.input + s.output)} sub={<><span style={{ color: 'var(--series-input)' }}>in</span> {short(s.input)} · <span style={{ color: 'var(--series-output)' }}>out</span> {short(s.output)}</>} />
          <Kpi label="Cache" value={short(s.cacheRead + s.cacheWrite)} sub={`đọc ${short(s.cacheRead)} · ghi ${short(s.cacheWrite)}`} />
          <Kpi label="Tỉ lệ cache đọc" value={(hit * 100).toFixed(1) + '%'} valueColor="var(--accent)"><ShareBar pct={hit * 100} color="var(--accent)" /></Kpi>
          <Kpi label="Tin nhắn" value={fmt(s.msgs)} sub="phản hồi của model" />
        </KpiStrip>

        <section className="panel pad">
          <div className="panel-bar">
            <h2>Token theo {g >= 1440 ? 'ngày' : g === 60 ? 'giờ' : g + ' phút'}</h2>
            <div className="legend">{KEYS.map(({ k, label, color }) => <span key={k}><i style={{ background: color }} />{label}</span>)}</div>
          </div>
          <StackedChart data={series} g={g} />
        </section>

        <div className="two">
          <GroupTable title="Theo model" label="Model" rows={byModel} render={(k) => k} />
          <GroupTable title="Theo dự án" label="Dự án" rows={byProject} render={projName} />
        </div>
      </div>
    </>
  )
}
