import { useState } from 'react'
import { api, useLoad } from '../api'
import { FolderPicker } from '../components/FolderPicker'
import { SideSlot, StatusSlot } from '../components/Shell'
import { Chip, ErrorBanner, Icon, Kbd, Kpi, KpiStrip, NavLabel, Spinner, type Tone } from '../components/ui'
import { buildInbox } from '../lib/inbox'
import { usePersisted } from '../lib/persist'
import { effective } from '../lib/limits'
import { relTime, short } from '../lib/format'
import { bridge, MOD, notifyEnabled } from '../lib/platform'
import { baseName } from '../lib/repo'
import { Link, navigate } from '../lib/router'
import { openPalette, setState, toast, useStore } from '../lib/store'
import type { ActivityItem } from '../types'

const VERBS: Record<string, [string, Tone]> = {
  push: ['Push', 'ok'], pushBranch: ['Push', 'ok'], pull: ['Pull', 'behind'], pullBranch: ['Pull', 'behind'], fetch: ['Fetch', 'muted'],
  commit: ['Commit', 'ahead'], createBranch: ['Nhánh', 'purple'], checkout: ['Nhánh', 'purple'], stage: ['Stage', 'muted'], unstage: ['Stage', 'muted'], scan: ['Quét', 'muted'],
}
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return Date.now() - d.getTime() < 864e5 ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : relTime(iso)
}
const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối' }

const Panel = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="panel min-w-0">
    <div className="flex items-center justify-between pr-3.5"><h2 className="panel-h">{title}</h2>{action}</div>
    {children}
  </section>
)

export function HomePage() {
  const ov = useLoad(api.overview, [], 30000, 'overview')
  const pinned = useStore((s) => s.pinned)
  const rq = useStore((s) => s.reviewQueue)
  const usage = useLoad(api.usage, [], 0, 'usage')
  const jobs = useLoad(api.jobs, [], 0, 'jobs')
  const jiraAcc = useLoad(api.jiraAccounts, [], 0, 'jiraAccounts')
  const remoteAcc = useLoad(api.remoteAccounts, [], 0, 'remoteAccounts')
  const hasJira = (jiraAcc.data?.length ?? 0) > 0
  const tickets = useLoad(async () => (hasJira ? api.jiraNew() : null), [hasJira], 0, 'homeJira')
  const repos = useStore((s) => s.repos)
  const attention = useStore((s) => s.attention)
  const remoteUnread = useStore((s) => s.remoteUnread)
  const jiraUnread = useStore((s) => s.jiraUnread)
  const [done, setDone] = usePersisted<string[]>('home.inboxDone', [], Array.isArray)
  const inbox = buildInbox({ repos, reviewQueue: rq, remoteUnread, jiraUnread }).filter((i) => !done.includes(i.id))
  const midnight = new Date().setHours(0, 0, 0, 0)
  const aiToday = usage.data ? usage.data.reduce((n, r) => (new Date(r.t).getTime() >= midnight ? n + effective(r) : n), 0) : null
  const jobList = jobs.data?.jobs ?? []
  const dirty = repos.filter((r) => r.staged + r.modified + r.untracked + r.conflicts > 0).length
  const [picking, setPicking] = useState(false)
  const b = bridge()
  const cfg = ov.data?.config
  const scan = ov.data?.scan
  const [off, setOff] = useState<string[]>([])

  // Thư mục đang quét + thư mục gần đây chưa chọn; bỏ tick = không quét thư mục đó
  const known = cfg ? [...new Set([...cfg.roots, ...cfg.recent])] : []
  const active = (cfg?.roots ?? []).filter((r) => !off.includes(r))
  const saveRoots = async (next: string[]) => {
    if (!next.length) { toast({ kind: 'err', title: 'Cần ít nhất một thư mục quét' }); return }
    try { await api.saveConfig({ roots: next, depth: cfg?.depth ?? 4 }); setOff([]); ov.reload() } catch (e) { toast({ kind: 'err', title: 'Không lưu được', detail: (e as Error).message }) }
  }
  const toggleRoot = (r: string) => void saveRoots(active.includes(r) ? active.filter((x) => x !== r) : [...active, r])

  const activity: (ActivityItem | { at: string; scan: true })[] = [
    ...(ov.data?.activity ?? []), ...(scan ? [{ at: scan.at, scan: true as const }] : []),
  ].sort((a, b2) => b2.at.localeCompare(a.at)).slice(0, 6)

  const addFolder = async () => {
    const dirs = (await b?.pickFolder?.()) ?? null
    if (dirs === null) setPicking(true)
    else if (dirs.length) void saveRoots([...new Set([...active, ...dirs])])
  }
  const [notify, setNotify] = useState(notifyEnabled)
  const openRepo = (p: string) => { setState({ selected: p }); navigate('/git') }
  const keys: [string, string][] = [['Bảng lệnh', MOD + 'K'], ['Mở Git và quét', MOD + '3'], ['Mở AI', MOD + '2'], ['Quét lại repo', MOD + 'R'], ['Commit', MOD + 'Enter']]

  return (
    <>
      <SideSlot>
        <div className="side-group">
          <NavLabel>Đã ghim</NavLabel>
          {pinned.map((p) => (
            <button key={p} className="nav-item" title={p} onClick={() => openRepo(p)}>
              <span className="size-1.5 flex-none rounded-full bg-[#4A4F57]" /><span className="truncate">{baseName(p)}</span>
            </button>
          ))}
          {!pinned.length && <span className="px-2 text-sm text-fg-mute">Chưa ghim repo nào</span>}
        </div>
        {hasJira && (
          <div className="side-group">
            <NavLabel>Ticket đã ghim</NavLabel>
            {(tickets.data?.items ?? []).filter((x) => x.pinned).slice(0, 8).map(({ issue: i }) => (
              <button key={i.key} className="nav-item" title={i.summary} onClick={() => navigate('/jira')}><span className="truncate font-mono text-sm">{i.key}</span></button>
            ))}
            {tickets.data && !tickets.data.items.some((x) => x.pinned) && <span className="px-2 text-sm text-fg-mute">Chưa ghim ticket nào</span>}
          </div>
        )}
      </SideSlot>
      <StatusSlot>
        <span className="sb-item"><span className="dot" />Rảnh · không có tác vụ nền</span>
        <span>{cfg ? cfg.roots.length : '—'} thư mục làm việc</span>
        <span className="sb-end">Quét chỉ chạy khi mở Git</span>
      </StatusSlot>

      {picking && cfg && <FolderPicker start={cfg.roots[0] ?? ''} selected={active} recent={cfg.recent} onClose={() => setPicking(false)}
        onToggle={(p) => void saveRoots(active.includes(p) ? active.filter((x) => x !== p) : [...active, p])} />}

      <div className="page" style={{ padding: '24px 28px', gap: 18 }}>
        <header className="page-h">
          <div className="flex flex-col gap-0.5">
            <h1>{greeting()}</h1>
            <span className="text-[12px] text-fg-mute">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} · trang này không quét repo, chi tiết chỉ tải khi mở từng mục</span>
          </div>
          <button className="btn" onClick={() => openPalette()}>Bảng lệnh <span className="font-mono text-xs text-fg-mute">{MOD}K</span></button>
        </header>

        {ov.error && <ErrorBanner onRetry={ov.reload}>Không đọc được dữ liệu: {ov.error}</ErrorBanner>}

        {rq.waiting > 0 && (
          <Link to="/remotes" className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[12.5px] !text-fg hover:bg-[#1F2124]">
            <Icon name="merge" size={14} />
            <span><b>{rq.waiting}</b> MR / PR đang chờ bạn review</span>
            {rq.late > 0 && <Chip tone="danger">{rq.late} trễ hơn 24 giờ</Chip>}
            <span className="ml-auto text-fg-mute">Mở hàng đợi →</span>
          </Link>
        )}

        <KpiStrip label="Tổng hợp">
          <Link to="/git" className="!text-fg"><Kpi label="Git" value={repos.length ? attention : '—'} sub={repos.length ? `${dirty} repo có thay đổi · ${repos.filter((r) => r.ahead > 0).length} chờ push` : 'Mở Git để quét'} /></Link>
          <Link to="/remotes" className="!text-fg"><Kpi label="Remotes" value={rq.waiting} sub={rq.late ? `${rq.late} trễ hơn 24 giờ` : 'chờ bạn review'} valueColor={rq.late ? 'var(--danger)' : undefined} /></Link>
          <Link to="/jira" className="!text-fg"><Kpi label="Jira" value={jiraUnread} sub="ticket có thay đổi mới" /></Link>
          <Link to="/ai" className="!text-fg"><Kpi label="AI" value={aiToday === null ? (usage.error ? '!' : '…') : short(aiToday)} sub="token hôm nay" /></Link>
          <Link to="/jobs" className="!text-fg"><Kpi label="Job" value={jobs.data ? jobList.length : (jobs.error ? '!' : '…')} sub={jobs.data && !jobs.data.supported ? 'chưa hỗ trợ hệ điều hành này' : `${jobList.filter((j) => j.kind === 'dev').length} dev · ${jobList.filter((j) => j.kind === 'test').length} test`} /></Link>
        </KpiStrip>

        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3.5">
          <div className="flex min-w-0 flex-col gap-3.5">
        <Panel title={`Cần xử lý${inbox.length ? ` · ${inbox.length}` : ''}`} action={done.length ? <button className="link-btn pr-0" onClick={() => setDone([])}>Hiện lại {done.length} mục đã ẩn</button> : undefined}>
          {inbox.slice(0, 8).map((i) => (
            <div key={i.id} className="flex items-center gap-2.5 border-t border-line px-3.5 py-2 text-[12px]">
              <Chip tone={i.source === 'git' ? 'muted' : i.source === 'remotes' ? 'ahead' : 'purple'}>{i.source === 'git' ? 'Git' : i.source === 'remotes' ? 'Remotes' : 'Jira'}</Chip>
              <span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{i.title}</span><span className="truncate text-fg-mute">{i.sub}</span></span>
              <button className="btn sm" onClick={() => (i.repo ? openRepo(i.repo) : navigate(i.to))}>Mở</button>
              <button className="btn sm" title="Ẩn trên máy này đến khi mục thay đổi" onClick={() => setDone([...done, i.id])}>Xong</button>
            </div>
          ))}
          {!inbox.length && <p className="empty border-t border-line">{repos.length ? 'Không có việc nào cần xử lý.' : 'Chưa quét Git nên chưa biết repo nào cần xử lý. Mở Git để quét.'}</p>}
        </Panel>

          <Panel title="Repo đã ghim" action={<Link to="/git" className="text-[12px]">Xem trạng thái ở Git →</Link>}>
            {pinned.slice(0, 5).map((p) => (
              <div key={p} className="flex items-center gap-2.5 border-t border-line px-3.5 py-2">
                <Icon name="folder" size={14} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <button className="ghost w-fit !text-fg text-left text-[12px] font-medium" onClick={() => openRepo(p)}>{baseName(p)}</button>
                  <span className="truncate font-mono text-xs text-fg-mute" title={p}>{p}</span>
                </span>
                {b?.openVSCode && <button className="btn sm" onClick={() => b.openVSCode!(p)}>VS Code</button>}
                {b?.openTerminal && <button className="btn sm" onClick={() => b.openTerminal!(p)}>Terminal</button>}
                <button className="btn sm" onClick={() => openRepo(p)}>Mở</button>
              </div>
            ))}
            {!pinned.length && <p className="empty border-t border-line">Ghim repo ở trang Git để mở nhanh từ đây.</p>}
          </Panel>
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
          <Panel title="Ticket của tôi" action={<Link to="/jira" className="text-[12px]">Mở Jira →</Link>}>
            {(tickets.data?.items ?? []).slice(0, 5).map(({ issue: i, events }) => (
              <div key={i.key} className="flex items-center gap-2.5 border-t border-line px-3.5 py-2 text-[12px]">
                <span className="font-mono text-fg-mute">{i.key}</span>
                <span className="min-w-0 flex-1 truncate" title={i.summary}>{i.summary}</span>
                {events.length > 0 && <Chip tone="behind">{events.length} mới</Chip>}
              </div>
            ))}
            {jiraAcc.data && !hasJira && <p className="empty border-t border-line">Chưa có account Jira. <Link to="/jira">Thêm account</Link> để thấy ticket tại đây.</p>}
            {hasJira && tickets.data && !tickets.data.items.length && <p className="empty border-t border-line">Không có ticket nào giao cho bạn hoặc đã ghim.</p>}
            {hasJira && tickets.loading && !tickets.data && <div className="border-t border-line"><div className="spinner-wrap compact"><span className="spinner" aria-hidden="true" /></div></div>}
          </Panel>

          <Panel title="MR / PR" action={<Link to="/remotes" className="text-[12px]">Mở Remotes →</Link>}>
            {remoteAcc.data && !remoteAcc.data.length
              ? <p className="empty border-t border-line">Chưa có account GitLab / GitHub. <Link to="/remotes">Thêm account</Link> để theo dõi MR / PR.</p>
              : <p className="border-t border-line px-3.5 py-2.5 text-[12px] text-fg-soft"><b>{rq.waiting}</b> đang chờ bạn review{rq.late > 0 && <> · <span className="text-danger">{rq.late} trễ hơn 24 giờ</span></>}{remoteUnread > 0 && <> · {remoteUnread} thread mới</>}</p>}
          </Panel>

          <Panel title="Job đang chạy" action={<Link to="/jobs" className="text-[12px]">Mở Job →</Link>}>
            {jobList.slice(0, 5).map((j) => (
              <div key={j.pid} className="flex items-center gap-2.5 border-t border-line px-3.5 py-2 text-[12px]">
                <Chip tone={j.kind === 'test' ? 'ahead' : 'ok'}>{j.kind === 'test' ? 'Test' : j.kind === 'dev' ? 'Dev' : j.kind === 'build' ? 'Build' : 'Khác'}</Chip>
                <span className="min-w-0 flex-1 truncate">{j.name}</span>
                <span className="font-mono text-sm text-fg-mute">{j.ports[0] ? ':' + j.ports[0].port : 'PID ' + j.pid}</span>
              </div>
            ))}
            {!jobList.length && <p className="empty border-t border-line">{jobs.data && !jobs.data.supported ? 'Hệ điều hành này chưa hỗ trợ xem job.' : 'Không có job nào đang chạy.'}</p>}
          </Panel>

          <Panel title="Thao tác gần đây">
            {activity.map((a, i) => {
              const sc = 'scan' in a
              const [verb, tone] = VERBS['scan' in a ? 'scan' : (a as ActivityItem).action] ?? [(a as ActivityItem).action, 'muted' as Tone]
              return (
                <div key={i} className="grid grid-cols-[64px_64px_1fr] items-center gap-2 border-t border-line px-3.5 py-[7px] text-[12px]">
                  <span className="font-mono text-sm text-fg-mute">{hhmm(a.at)}</span>
                  <span className="justify-self-start">{!sc && !a.ok ? <Chip tone="danger">Lỗi</Chip> : <Chip tone={tone}>{verb}</Chip>}</span>
                  <span className="truncate">{sc ? <>{scan!.roots.length} thư mục <span className="text-fg-mute">{scan!.repos} repo · {(scan!.ms / 1000).toFixed(1)}s</span></> : <>{a.repo} <span className="text-fg-mute">{a.ok ? a.detail : a.error}</span></>}</span>
                </div>
              )
            })}
            {!activity.length && (ov.loading && !ov.data ? <div className="border-t border-line"><div className="spinner-wrap compact"><span className="spinner" aria-hidden="true" /></div></div> : <p className="empty border-t border-line">Chưa có thao tác nào.</p>)}
          </Panel>
          </div>
        </div>

        <details className="rounded-[10px] border border-border bg-surface">
          <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] font-semibold">Thiết lập nhanh <span className="font-normal text-fg-mute">thư mục làm việc, thông báo, phím tắt</span></summary>
          <div className="grid grid-cols-2 gap-3.5 p-3.5 pt-0">
          <Panel title="Thư mục làm việc" action={<button className="btn sm !border !border-border-strong" onClick={addFolder}>+ Thêm thư mục</button>}>
            <div className="flex flex-col gap-1.5 px-3.5 pt-0.5 pb-3">
              {known.map((r) => (
                <label key={r} className="flex h-7 items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={active.includes(r)} onChange={() => toggleRoot(r)} aria-label={'Quét ' + r} />
                  <span className="min-w-0 flex-1 truncate font-mono" title={r}>{r}</span>
                  <span className="text-sm text-fg-mute">{cfg!.roots.includes(r) ? (scan?.byRoot[r] !== undefined ? `${scan.byRoot[r]} repo lần trước` : 'chưa quét') : 'gần đây, không quét'}</span>
                </label>
              ))}
              {!known.length && <span className="text-sm text-fg-mute">{ov.loading ? <span className="flex items-center gap-2"><Spinner inline />Đang tải…</span> : 'Chưa chọn thư mục nào'}</span>}
            </div>
          </Panel>

          <Panel title="Phím tắt">
            {b?.notify && (
              <label className="flex items-center gap-2 px-3.5 pb-1 text-[12px] text-fg-soft">
                <input type="checkbox" checked={notify} onChange={(e) => { setNotify(e.target.checked); try { localStorage.setItem('notify', e.target.checked ? '1' : '0') } catch { /* bỏ qua */ } }} />
                Thông báo hệ thống khi Push/Pull lỗi
              </label>
            )}
            <div className="flex flex-col gap-1.5 px-3.5 pt-0.5 pb-3">
              {keys.map(([label, k]) => <div key={label} className="flex h-6 items-center justify-between text-[12px] text-fg-soft">{label}<Kbd>{k}</Kbd></div>)}
            </div>
          </Panel>
          </div>
        </details>
      </div>
    </>
  )
}
