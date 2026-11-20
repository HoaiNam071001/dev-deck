import { useMemo, useState } from 'react'
import { api, useLoad } from '../api'
import { StackedChart } from '../components/StackedChart'
import { fmt, projName, short } from '../lib/format'
import { buckets, filterRows, granOf, group, KEYS, sum, totalOf, type Totals } from '../lib/usage'

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      <div className="kpi-s">{sub}</div>
    </div>
  )
}

function GroupTable({ title, label, rows, render }: { title: string; label: string; rows: (Totals & { k: string })[]; render: (k: string) => string }) {
  return (
    <div className="card scroll">
      <h2>{title}</h2>
      <table>
        <thead><tr><th>{label}</th><th>Tin</th><th>Input</th><th>Output</th><th>Cache W</th><th>Cache R</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td>{render(r.k)}</td><td>{fmt(r.msgs)}</td><td>{short(r.input)}</td><td>{short(r.output)}</td><td>{short(r.cacheWrite)}</td><td>{short(r.cacheRead)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TokenPage() {
  const { data, error, loading, reload } = useLoad(api.usage, [])
  const [range, setRange] = useState('1')
  const [gran, setGran] = useState(0)
  const [project, setProject] = useState('')

  const projects = useMemo(() => [...new Set((data ?? []).map((r) => r.project))].sort(), [data])
  const rows = useMemo(() => filterRows(data ?? [], range, project), [data, range, project])
  const s = useMemo(() => sum(rows), [rows])
  const g = granOf(gran, range)
  const series = useMemo(() => buckets(rows, g), [rows, g])
  const byTotal = (a: Totals, b: Totals) => totalOf(b) - totalOf(a)
  const byModel = useMemo(() => group(rows, (r) => r.model).sort(byTotal), [rows])
  const byProject = useMemo(() => group(rows, (r) => r.project).sort(byTotal), [rows])

  const all = totalOf(s)
  const hitBase = s.cacheRead + s.cacheWrite + s.input
  const hit = hitBase ? s.cacheRead / hitBase : 0

  return (
    <>
      <div className="toolbar">
        <h1>Token Claude Code</h1>
        <div className="controls">
          <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Khoảng thời gian">
            <option value="h1">1 giờ qua</option><option value="h6">6 giờ qua</option><option value="h24">24 giờ qua</option>
            <option value="1">Hôm nay</option><option value="7">7 ngày</option><option value="30">30 ngày</option><option value="0">Tất cả</option>
          </select>
          <select value={gran} onChange={(e) => setGran(Number(e.target.value))} aria-label="Độ chi tiết">
            <option value="0">Chi tiết: tự động</option><option value="1">1 phút</option><option value="5">5 phút</option>
            <option value="15">15 phút</option><option value="60">1 giờ</option><option value="1440">1 ngày</option>
          </select>
          <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Dự án">
            <option value="">Mọi dự án</option>
            {projects.map((p) => <option key={p} value={p}>{projName(p)}</option>)}
          </select>
          <button onClick={reload} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</button>
        </div>
      </div>

      {error && <div className="card error">Không đọc được dữ liệu: {error}</div>}

      <div className="kpis">
        <Kpi label="Tổng token" value={short(all)} sub={fmt(all)} />
        <Kpi label="Input + Output" value={short(s.input + s.output)} sub={`in ${short(s.input)} · out ${short(s.output)}`} />
        <Kpi label="Cache" value={short(s.cacheRead + s.cacheWrite)} sub={`đọc ${short(s.cacheRead)} · ghi ${short(s.cacheWrite)}`} />
        <Kpi label="Tỉ lệ cache đọc" value={(hit * 100).toFixed(1) + '%'} sub="cache read / tổng input đầu vào" />
        <Kpi label="Số tin nhắn" value={fmt(s.msgs)} sub="phản hồi của model" />
      </div>

      <div className="card">
        <h2>Token theo {g >= 1440 ? 'ngày' : g === 60 ? 'giờ' : g + ' phút'}</h2>
        <div className="legend">
          {KEYS.map(({ k, label, color }) => <span key={k}><i style={{ background: color }} />{label}</span>)}
        </div>
        <StackedChart data={series} g={g} />
      </div>

      <div className="two">
        <GroupTable title="Theo model" label="Model" rows={byModel} render={(k) => k} />
        <GroupTable title="Theo dự án" label="Dự án" rows={byProject} render={projName} />
      </div>
    </>
  )
}
