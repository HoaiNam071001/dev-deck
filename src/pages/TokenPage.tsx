import { useEffect, useMemo } from 'react'
import { api, useLoad } from '../api'
import { RefreshInfo, useRefreshMs } from '../components/RefreshInfo'
import { SideSlot, StatusSlot } from '../components/Shell'
import { StackedChart } from '../components/StackedChart'
import { UsageWindows } from '../components/UsageWindows'
import { ErrorBanner, Icon, Kpi, KpiStrip, NavLabel, Segmented, Select, ShareBar, Spinner } from '../components/ui'
import { ShortNum } from '../components/ShortNum'
import { dayKey, fmt } from '../lib/format'
import { downloadCsv } from '../lib/csv'
import { usePersisted } from '../lib/persist'
import { buckets, filterRows, granOf, group, KEYS, topSeries, PROVIDERS, providerOf, sum, totalOf, type Totals } from '../lib/usage'

const RANGES = [
  { id: 'h1', label: '1h', name: '1 giờ qua' }, { id: 'h6', label: '6h', name: '6 giờ qua' }, { id: 'h24', label: '24h', name: '24 giờ qua' },
  { id: '1', label: 'Hôm nay', name: 'Hôm nay' }, { id: '7', label: '7 ngày', name: '7 ngày qua' }, { id: '30', label: '30 ngày', name: '30 ngày qua' },
  { id: '0', label: 'Tất cả', name: 'Toàn bộ' },
]


/** Màu theo phần của dòng so với dòng lớn nhất: xanh ít → cam nhiều → đỏ chiếm phần lớn. */
const heat = (r: number) => (r >= 0.85 ? 'var(--danger)' : r >= 0.5 ? 'var(--behind)' : r >= 0.15 ? 'var(--accent)' : 'var(--fg-mute)')

function GroupTable({ title, label, rows, render, dot, tip }: { tip?: (k: string) => string | undefined; title: string; label: string; rows: (Totals & { k: string })[]; render: (k: string) => string; dot?: (k: string) => string | undefined }) {
  const max = Math.max(1, ...rows.map(totalOf))
  return (
    <section className="panel">
      <h2 className="panel-h">{title}</h2>
      <table className="tbl">
        <thead><tr><th scope="col">{label}</th><th scope="col">Tin</th><th scope="col">In / Out</th><th scope="col">Cache</th><th scope="col" className="w-total">Tổng</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td title={tip?.(r.k) ?? r.k}>{dot?.(r.k) && <i className="pdot" style={{ background: dot(r.k) }} />}{render(r.k)}</td>
              <td className="muted">{fmt(r.msgs)}</td>
              <td>{<ShortNum n={r.input} />} / {<ShortNum n={r.output} />}</td>
              <td>{<ShortNum n={r.cacheRead + r.cacheWrite} />}</td>
              <td><span className="total-cell"><ShareBar pct={(totalOf(r) / max) * 100} color={heat((totalOf(r) / max))} /><span style={{ color: heat(totalOf(r) / max) }}>{<ShortNum n={totalOf(r)} />}</span></span></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="empty">Không có dữ liệu</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

export function TokenPage() {
  const [ms, sec, setSec] = useRefreshMs('ai', 30)
  const { data, error, loading, reload, at, ms: tookMs } = useLoad(api.usage, [], ms, 'usage')
  const [range, setRange] = usePersisted<string>('ai.range', '1', (v) => typeof v === 'string' && RANGES.some((r) => r.id === v))
  const [gran, setGran] = usePersisted<number>('ai.gran', 0, (v) => typeof v === 'number')
  const [tab, setTab] = usePersisted<'chart' | 'detail'>('ai.tab', 'chart', (v) => v === 'chart' || v === 'detail')
  const [stack, setStack] = usePersisted<'type' | 'provider' | 'project'>('ai.stack', 'type', (v) => v === 'type' || v === 'provider' || v === 'project')
  const [project, setProject] = usePersisted<string>('ai.project', '', (v) => typeof v === 'string')
  const [provider, setProvider] = usePersisted<string>('ai.provider', '', (v) => typeof v === 'string')
  const sources = useLoad(api.usageSources, [], ms, 'usageSources').data ?? []

  const all = data ?? []
  const projects = useMemo(() => [...new Set(all.map((r) => r.project))].sort(), [all])
  const projPath = useMemo(() => { const m = new Map<string, string>(); for (const r of all) if (r.projectPath && !m.has(r.project)) m.set(r.project, r.projectPath); return m }, [all])
  // Đổi nhà cung cấp mà dự án đang chọn không có ở đó thì bỏ lọc dự án
  useEffect(() => { if (project && data && !data.some((r) => r.project === project && (!provider || r.provider === provider))) setProject('') }, [provider, project, data])
  const inRange = useMemo(() => filterRows(all, range, '', provider), [all, range, provider])
  const projTotals = useMemo(() => new Map(group(inRange, (r) => r.project).map((g) => [g.k, totalOf(g)])), [inRange])
  const rows = useMemo(() => (project ? inRange.filter((r) => r.project === project) : inRange), [inRange, project])
  const s = useMemo(() => sum(rows), [rows])
  const g = granOf(gran, range)
  const projSeries = useMemo(() => (stack === 'project' ? topSeries(rows) : []), [rows, stack])
  const series = useMemo(
    () => (stack === 'project' ? buckets(rows, g, (r) => r.project, new Set(projSeries.map((s) => s.k))) : buckets(rows, g)),
    [rows, g, stack, projSeries],
  )
  const byTotal = (a: Totals, b: Totals) => totalOf(b) - totalOf(a)
  const byModel = useMemo(() => group(rows, (r) => r.model).sort(byTotal), [rows])
  const byProject = useMemo(() => group(rows, (r) => r.project).sort(byTotal), [rows])
  const byProvider = useMemo(() => group(rows, (r) => r.provider as string).sort(byTotal), [rows])
  const modelProvider = useMemo(() => new Map(rows.map((r) => [r.model, r.provider as string])), [rows])
  const hasData = (id: string) => sources.find((s) => s.id === id)?.rows ? true : all.some((r) => r.provider === id)

  const total = totalOf(s)
  const hitBase = s.cacheRead + s.cacheWrite + s.input
  const hit = hitBase ? s.cacheRead / hitBase : 0

  // So với hôm qua (cùng khoảng giờ đã trôi qua trong ngày), chỉ khi xem "Hôm nay"
  const delta = useMemo(() => {
    if (range !== '1') return null
    const now = new Date()
    const y0 = new Date(new Date().setHours(0, 0, 0, 0) - 864e5)
    const yNow = new Date(now.getTime() - 864e5)
    const yRows = all.filter((r) => { const t = new Date(r.t); return t >= y0 && t <= yNow && (!project || r.project === project) && (!provider || r.provider === provider) })
    const yTotal = totalOf(sum(yRows))
    return yTotal ? (total - yTotal) / yTotal : null
  }, [all, range, project, provider, total])

  const exportCsv = () => {
    const stamp = dayKey(new Date())
    const num = (t: Totals) => [t.input, t.output, t.cacheWrite, t.cacheRead, totalOf(t), t.msgs]
    if (tab === 'detail') {
      const head = ['Nhóm', 'Tên', 'Input', 'Output', 'Cache ghi', 'Cache đọc', 'Tổng', 'Tin nhắn']
      const body = [
        ...byProvider.map((r) => ['Nhà cung cấp', providerOf(r.k)?.label ?? r.k, ...num(r)]),
        ...byModel.map((r) => ['Model', r.k, ...num(r)]),
        ...byProject.map((r) => ['Dự án', r.k, ...num(r)]),
      ]
      downloadCsv(`ai-token-chi-tiet-${stamp}.csv`, [head, ...body])
      return
    }
    const cols = stack === 'project' ? projSeries : []
    const head = ['Thời điểm', 'Input', 'Output', 'Cache ghi', 'Cache đọc', 'Tổng', 'Tin nhắn', ...cols.map((c) => 'Dự án: ' + c.label)]
    const body = series.map((x) => [`${dayKey(new Date(x.b))} ${x.time}`, ...num(x), ...cols.map((c) => x.bySeries[c.k] ?? 0)])
    downloadCsv(`ai-token-${stamp}.csv`, [head, ...body])
  }

  const rangeName = RANGES.find((r) => r.id === range)!.name

  return (
    <>
      <SideSlot>
        <div className="side-group">
          <NavLabel>Dự án</NavLabel>
          <button className={'nav-item' + (!project ? ' on' : '')} aria-pressed={!project} onClick={() => setProject('')}>
            Mọi dự án<span className="nav-n">{<ShortNum n={totalOf(sum(inRange))} />}</span>
          </button>
          {projects.map((p) => (
            <button key={p} className={'nav-item' + (project === p ? ' on' : '')} aria-pressed={project === p} title={projPath.get(p) ?? p} onClick={() => setProject(p)}>
              <span className="truncate">{p}</span><span className="nav-n">{<ShortNum n={projTotals.get(p) ?? 0} />}</span>
            </button>
          ))}
        </div>
        <div className="side-foot">
          <span>Nguồn log</span>
          {(sources.length ? sources : PROVIDERS.map((p) => ({ id: p.id, label: p.label, root: '', found: false, files: 0, rows: 0 }))).map((s) => (
            <span key={s.id} className="src" title={s.found ? `${s.root}
${s.files} file · ${s.rows} tin` : `Chưa thấy log${s.root ? ' tại ' + s.root : ''}`} style={{ opacity: s.found ? 1 : 0.5 }}>
              <i className="pdot" style={{ background: providerOf(s.id)?.color }} />{s.label}{s.found ? <span className="mono"> · {fmt(s.rows)}</span> : <span> · chưa có</span>}
            </span>
          ))}
        </div>
      </SideSlot>
      <StatusSlot>
        <span className="sb-item"><span className={'dot ' + (error ? 'bad' : loading ? 'busy' : 'ok')} />{error ? 'Lỗi đọc log' : 'Log'}</span>
        <span>{fmt(all.length)} tin · {projects.length} dự án</span>
        <RefreshInfo at={at} ms={tookMs} loading={loading} sec={sec} onSec={setSec} />
      </StatusSlot>

      <div className="page">
        <header className="page-h">
          <div className="page-t">
            <h1>Token AI</h1>
            <span className="muted">{rangeName} · {project || 'mọi dự án'}</span>
          </div>
          <div className="page-tools">
            <Select label="Nhà cung cấp" value={provider} onChange={setProvider}
              options={[{ id: '', label: 'Tất cả' }, ...PROVIDERS.filter((p) => hasData(p.id) || provider === p.id).map((p) => ({ id: p.id as string, label: p.label }))]} />
            <Select label="Khoảng thời gian" value={range} onChange={setRange} options={RANGES.map(({ id, label }) => ({ id, label }))} />
            {tab === 'chart' && <>
            <select value={gran} onChange={(e) => setGran(Number(e.target.value))} aria-label="Độ chi tiết">
              <option value="0">Tự động</option><option value="1">1 phút</option><option value="5">5 phút</option>
              <option value="15">15 phút</option><option value="60">Theo giờ</option><option value="1440">Theo ngày</option>
            </select>
            <select value={stack} onChange={(e) => setStack(e.target.value as 'type' | 'provider' | 'project')} aria-label="Chia biểu đồ theo">
              <option value="type">Theo loại token</option><option value="provider">Theo nhà cung cấp</option><option value="project">So sánh dự án</option>
            </select>
            </>}
            <button className="icon-btn" aria-label="Tải lại" title="Tải lại" onClick={reload} disabled={loading}><Icon name="refresh" size={13} spin={loading} /></button>
            <button className="icon-btn" aria-label="Xuất CSV" title={tab === 'detail' ? 'Xuất CSV (bảng chi tiết)' : 'Xuất CSV (theo thời gian)'} onClick={exportCsv} disabled={!series.length}><Icon name="download" size={13} /></button>
          </div>
        </header>

        {error && <ErrorBanner onRetry={reload}>Không đọc được dữ liệu: {error}</ErrorBanner>}

        <UsageWindows rows={provider ? all.filter((r) => r.provider === provider) : all} />

        <Segmented label="Mục xem" value={tab} onChange={setTab}
          options={[{ id: 'chart', label: 'Tổng quan' }, { id: 'detail', label: 'Chi tiết', count: byProvider.length + byModel.length + byProject.length }]} />

        {loading && !data && <Spinner label="Đang đọc log token…" />}

        {data && tab === 'chart' && <>
        <KpiStrip label="Chỉ số">
          <Kpi label="Tổng token" value={<ShortNum n={total} />}
            sub={delta === null ? `${fmt(total)} token` : <><span style={{ color: delta > 0 ? 'var(--behind)' : 'var(--accent)' }}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(0)}%</span> so với hôm qua</>} />
          <Kpi label="Input + Output" value={<ShortNum n={s.input + s.output} />} sub={<><span style={{ color: 'var(--series-input)' }}>in</span> <ShortNum n={s.input} /> · <span style={{ color: 'var(--series-output)' }}>out</span> <ShortNum n={s.output} /></>} />
          <Kpi label="Cache" value={<ShortNum n={s.cacheRead + s.cacheWrite} />} sub={<>đọc <ShortNum n={s.cacheRead} /> · ghi <ShortNum n={s.cacheWrite} /></>} />
          <Kpi label="Tỉ lệ cache đọc" value={(hit * 100).toFixed(1) + '%'} valueColor="var(--accent)"><ShareBar pct={hit * 100} color="var(--accent)" /></Kpi>
          <Kpi label="Tin nhắn" value={fmt(s.msgs)} sub="phản hồi của model" />
        </KpiStrip>

        <section className="panel pad">
          <div className="panel-bar">
            <h2>Token theo {g >= 1440 ? 'ngày' : g === 60 ? 'giờ' : g + ' phút'}</h2>
            <div className="legend">{(stack === 'project' ? projSeries : stack === 'provider' ? PROVIDERS.map((p) => ({ k: p.id, label: p.label, color: p.color })) : KEYS).map(({ k, label, color }) => <span key={k}><i style={{ background: color }} />{label}</span>)}</div>
          </div>
          <StackedChart data={series} g={g} by={stack} series={projSeries} />
        </section>
        </>}

        {data && tab === 'detail' && <>
        <div className="two">
          <GroupTable title="Theo nhà cung cấp" label="Nhà cung cấp" rows={byProvider} render={(k) => providerOf(k)?.label ?? k} dot={(k) => providerOf(k)?.color} />
          <GroupTable title="Theo model" label="Model" rows={byModel} render={(k) => k} dot={(k) => providerOf(modelProvider.get(k) ?? '')?.color} />
        </div>
        <div className="two">
          <GroupTable title="Theo dự án" label="Dự án" rows={byProject} render={(k) => k} tip={(k) => projPath.get(k)} />
        </div>
        </>}
      </div>
    </>
  )
}
