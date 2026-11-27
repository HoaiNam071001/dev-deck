import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { api, useLoad } from '../api'
import { RemoteAccountModal } from '../components/RemoteAccountModal'
import { RemoteBranches } from '../components/RemoteBranches'
import { RemotePipelines } from '../components/RemotePipelines'
import { RemoteDetailModal } from '../components/RemoteDetail'
import { ApprovalChip, CiChip, copyCrLink, CR_WORD, crRef, PROVIDER_LABEL, ProviderTag, ThreadChip, unresolved } from '../components/RemoteBits'
import { SideSlot, StatusSlot } from '../components/Shell'
import { Chip, Icon, Kpi, KpiStrip, NavLabel, Segmented, Spinner } from '../components/ui'
import { relTime } from '../lib/format'
import { usePersisted } from '../lib/persist'
import { GROUP_BYS, groupChangeRequests, projectKey, projectsOf, type CrGroup, type GroupBy, type ProjectEntry } from '../lib/remoteGroups'
import { toast } from '../lib/store'
import type { ChangeRequest, CrScope, CrState } from '../types'

const SCOPES: CrScope[] = ['mine', 'review', 'assigned', 'all']
const STATES: CrState[] = ['opened', 'merged', 'closed']
const REFRESH_MS = 60000
const isStrArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string')
/** Số MR hiển thị tối đa của một nhóm trước khi bấm "Xem thêm". */
const GROUP_LIMIT = 8

function CrRow({ c, hideProject, onOpen }: { c: ChangeRequest; hideProject: boolean; onOpen: () => void }) {
  const onKey = (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }
  return (
    <div role="button" tabIndex={0} aria-haspopup="dialog" onClick={onOpen} onKeyDown={onKey}
      className="group flex cursor-pointer items-center gap-3.5 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-[#1F2124]">
      {!hideProject && <ProviderTag provider={c.provider} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {c.draft && <Chip tone="muted">Draft</Chip>}
          <span className="truncate text-[13.5px] font-semibold" title={c.title}>{c.title}</span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-fg-mute">
          <span className="mono">{crRef(c)}</span>·
          {!hideProject && <><span className="truncate" title={c.project}>{c.project}</span>·</>}
          <span className="mono rounded bg-raised px-1.5 text-[11px] text-fg-soft">{c.source}</span>→<span className="mono rounded bg-raised px-1.5 text-[11px] text-fg-soft">{c.target}</span>
          {!c.mine && <>·<span className="truncate">{c.author.name}</span></>}
        </div>
      </div>
      <div className="flex flex-none flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap max-md:hidden">
        <CiChip ci={c.ci} />
        <ApprovalChip a={c.approvals} />
        <ThreadChip t={c.threads} />
        {c.conflict && <Chip tone="danger">Conflict</Chip>}
        {c.state !== 'opened' && <Chip tone={c.state === 'merged' ? 'purple' : 'muted'}>{c.state === 'merged' ? 'Merged' : 'Closed'}</Chip>}
      </div>
      <button type="button" className="ghost flex size-6 flex-none items-center justify-center opacity-0 focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Chép link ${CR_WORD[c.provider]} ${crRef(c)}`} title={`Chép link ${CR_WORD[c.provider]}`}
        onClick={(e) => { e.stopPropagation(); void copyCrLink(c) }} onKeyDown={(e) => e.stopPropagation()}><Icon name="copy" size={13} /></button>
      <span className="w-[80px] flex-none text-right text-[12px] text-fg-mute" title={new Date(c.updatedAt).toLocaleString('vi-VN')}>{relTime(c.updatedAt)}</span>
    </div>
  )
}

function GroupBlock({ g, by, collapsed, pinned, expanded, onToggle, onPin, onHide, onExpand, onOpen }: {
  g: CrGroup; by: GroupBy; collapsed: boolean; pinned: boolean; expanded: boolean
  onToggle: () => void; onPin: () => void; onHide: () => void; onExpand: () => void; onOpen: (c: ChangeRequest) => void
}) {
  const shown = expanded ? g.items : g.items.slice(0, GROUP_LIMIT)
  const byProject = by === 'project'
  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-surface" aria-label={g.title}>
      <div className={'flex items-center gap-2.5 bg-surface-2 px-3.5 py-2 ' + (collapsed ? '' : 'border-b border-border')}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={!collapsed} onClick={onToggle}>
          <span className="w-3 flex-none text-fg-mute" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
          {g.provider && <ProviderTag provider={g.provider} />}
          <span className="min-w-0 truncate text-[13.5px] font-semibold" title={g.title}>{g.title}</span>
          {g.sub && <span className="mono min-w-0 truncate text-[11.5px] text-fg-mute max-lg:hidden" title={g.sub}>{g.sub}</span>}
        </button>
        <span className="flex flex-none items-center gap-1.5 whitespace-nowrap">
          <Chip tone="muted">{g.items.length} mục</Chip>
          {g.threads > 0 && <Chip tone="behind">{g.threads} thread</Chip>}
          {g.ciFail > 0 && <Chip tone="danger">{g.ciFail} CI lỗi</Chip>}
          {g.conflicts > 0 && <Chip tone="danger">{g.conflicts} conflict</Chip>}
        </span>
        {byProject && (
          <>
            <button type="button" className={'ghost flex size-6 items-center justify-center text-[14px] ' + (pinned ? 'text-behind' : 'text-fg-mute')} aria-pressed={pinned} aria-label={(pinned ? 'Bỏ ghim ' : 'Ghim ') + g.title} title={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'} onClick={onPin}>{pinned ? '★' : '☆'}</button>
            <button type="button" className="ghost flex size-6 items-center justify-center" aria-label={'Ẩn ' + g.title} title="Ẩn project này khỏi danh sách (bỏ ẩn ở nút Project đã ẩn cuối panel trái)" onClick={onHide}><Icon name="x" size={12} /></button>
          </>
        )}
      </div>
      {!collapsed && (
        <>
          {shown.map((c) => <CrRow key={c.key} c={c} hideProject={byProject} onOpen={() => onOpen(c)} />)}
          {g.items.length > GROUP_LIMIT && (
            <button type="button" className="w-full border-t border-line py-2 text-[12px] text-ahead hover:bg-[#1F2124]" onClick={onExpand}>
              {expanded ? 'Thu gọn' : `Xem thêm ${g.items.length - GROUP_LIMIT} mục`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export function RemotesPage() {
  const accounts = useLoad(api.remoteAccounts, [])
  const [account, setAccount] = usePersisted<string>('remotes.account', 'all', (v) => typeof v === 'string')
  const [scope, setScope] = usePersisted<CrScope>('remotes.scope', 'all', (v) => SCOPES.includes(v as CrScope))
  const [state, setState] = usePersisted<CrState>('remotes.state', 'opened', (v) => STATES.includes(v as CrState))
  const [groupBy, setGroupBy] = usePersisted<GroupBy>('remotes.groupBy', 'project', (v) => GROUP_BYS.includes(v as GroupBy))
  const [pinnedArr, setPinnedArr] = usePersisted<string[]>('remotes.pinned', [], isStrArr)
  const [hiddenArr, setHiddenArr] = usePersisted<string[]>('remotes.hidden', [], isStrArr)
  const [collapsedArr, setCollapsedArr] = usePersisted<string[]>('remotes.collapsed', [], isStrArr)
  const [tab, setTab] = usePersisted<'mr' | 'branches' | 'pipelines'>('remotes.tab', 'mr', (v) => v === 'mr' || v === 'branches' || v === 'pipelines')
  const [project, setProject] = usePersisted<string | null>('remotes.project', null, (v) => v === null || typeof v === 'string')
  // Project đã từng thấy: giữ trong danh sách bên trái dù bộ lọc hiện tại không có MR nào, để đổi phạm vi không làm mất / đổi project đang chọn
  const [known, setKnown] = usePersisted<Record<string, Pick<ProjectEntry, 'name' | 'parent' | 'provider' | 'accountId'>>>('remotes.knownProjects', {}, (v) => !!v && typeof v === 'object' && !Array.isArray(v))
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const pinned = useMemo(() => new Set(pinnedArr), [pinnedArr])
  const hidden = useMemo(() => new Set(hiddenArr), [hiddenArr])
  const collapsed = useMemo(() => new Set(collapsedArr), [collapsedArr])
  const toggleIn = (arr: string[], set: (v: string[]) => void, k: string) => set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k])

  const accs = accounts.data ?? []
  const effective = account === 'all' || accs.some((a) => a.id === account) ? account : 'all'
  const hasAccounts = accs.length > 0
  const crs = useLoad(() => (hasAccounts ? api.changeRequests(effective, scope, state) : Promise.resolve({ items: [], errors: [], fetchedAt: '' })), [effective, scope, state, hasAccounts], REFRESH_MS)

  const all = crs.data?.items ?? []
  // Project đã ẩn không có MR nào trong danh sách; bỏ ẩn ở nút "Đã ẩn" cuối panel trái
  const visible = useMemo(() => all.filter((c) => !hidden.has(projectKey(c))), [all, hidden])
  const present = useMemo(() => projectsOf(visible), [visible])
  // Danh sách project cố định: chỉ thêm khi thấy project mới, không đổi thứ tự theo bộ lọc
  useEffect(() => {
    const fresh = projectsOf(all).filter((p) => !known[p.key])
    if (fresh.length) setKnown({ ...known, ...Object.fromEntries(fresh.map((p) => [p.key, { name: p.name, parent: p.parent, provider: p.provider, accountId: p.accountId }])) })
  }, [all, known, setKnown])
  const projects = useMemo(() => {
    const counts = new Map(present.map((p) => [p.key, p]))
    return Object.entries(known)
      .filter(([k, v]) => !hidden.has(k) && (effective === 'all' || v.accountId === effective))
      .map(([key, v]): ProjectEntry => counts.get(key) ?? { key, ...v, count: 0, threads: 0, ciFail: 0 })
      .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
  }, [present, known, effective, hidden])
  const hiddenEntries = useMemo(() => hiddenArr.map((k) => ({ key: k, name: known[k] ? (known[k].parent ? `${known[k].parent}/${known[k].name}` : known[k].name) : k.slice(k.indexOf('|') + 1) })).sort((a, b) => a.name.localeCompare(b.name)), [hiddenArr, known])
  // Project chỉ bị bỏ lọc khi không còn thuộc account đang xem (hoặc đã bị xóa khỏi danh sách đã biết)
  const activeProject = project && projects.some((p) => p.key === project) ? project : null

  const q = query.trim().toLowerCase()
  const list = useMemo(() => visible.filter((c) =>
    (!activeProject || projectKey(c) === activeProject) &&
    (!q || `${c.title} ${c.source} ${c.target} ${c.project} ${crRef(c)} ${c.author.name}`.toLowerCase().includes(q))), [visible, activeProject, q])
  const groups = useMemo(() => groupChangeRequests(list, groupBy, pinned), [list, groupBy, pinned])

  const opened = list.filter((c) => c.state === 'opened')
  const stats = {
    open: opened.length,
    review: opened.filter((c) => c.reviewMe).length,
    threads: opened.reduce((s, c) => s + unresolved(c), 0),
    ciFail: opened.filter((c) => c.ci === 'failed').length,
    conflict: opened.filter((c) => c.conflict).length,
  }
  const picked = openKey ? all.find((c) => c.key === openKey) : undefined
  const activeEntry = activeProject ? projects.find((p) => p.key === activeProject) : undefined
  const pinnedProjects = projects.filter((p) => pinned.has(p.key))
  const otherProjects = projects.filter((p) => !pinned.has(p.key))

  const removeAccount = async (id: string) => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setConfirmDel(null)
    try { await api.removeRemoteAccount(id); if (account === id) setAccount('all'); accounts.reload(); toast({ kind: 'ok', title: 'Đã xóa account', detail: 'Token đã bị xóa khỏi máy.' }) }
    catch (e) { toast({ kind: 'err', title: 'Không xóa được', detail: (e as Error).message }) }
  }
  const hideProject = (k: string, name: string) => {
    setHiddenArr([...hidden, k].filter((x, i, a) => a.indexOf(x) === i))
    if (project === k) setProject(null)
    toast({ kind: 'ok', title: 'Đã ẩn project', detail: `${name} · xem lại ở nút "Project đã ẩn" cuối panel trái` })
  }

  const ProjectItem = ({ p }: { p: (typeof projects)[number] }) => {
    const full = p.parent ? `${p.parent}/${p.name}` : p.name
    const isPinned = pinned.has(p.key)
    return (
      <div className="group relative">
        <button className={'nav-item' + (activeProject === p.key ? ' on' : '')} aria-pressed={activeProject === p.key} title={full} onClick={() => setProject(activeProject === p.key ? null : p.key)}>
          <span className={'size-2 flex-none rounded-full ' + (p.provider === 'gitlab' ? 'bg-[#C9A8FF]' : 'bg-[#8FE0B0]')} />
          <span className="truncate">{p.name}</span>
          {p.ciFail > 0 && <span className="size-1.5 flex-none rounded-full bg-danger" title={`${p.ciFail} CI lỗi`} />}
          {p.threads > 0 && <span className="size-1.5 flex-none rounded-full bg-behind" title={`${p.threads} thread chưa resolve`} />}
          <span className="nav-n group-hover:invisible">{p.count}</span>
        </button>
        <span className="invisible absolute right-1 top-0.5 flex items-center group-focus-within:visible group-hover:visible">
          <button className={'ghost flex size-[22px] items-center justify-center text-[13px] ' + (isPinned ? 'text-behind' : 'text-fg-mute')} aria-pressed={isPinned} aria-label={(isPinned ? 'Bỏ ghim ' : 'Ghim ') + full} title={isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'} onClick={() => toggleIn(pinnedArr, setPinnedArr, p.key)}>{isPinned ? '★' : '☆'}</button>
          <button className="ghost flex size-[22px] items-center justify-center" aria-label={'Ẩn ' + full} title="Ẩn project (bỏ ẩn ở nút Project đã ẩn cuối panel)" onClick={() => hideProject(p.key, full)}><Icon name="x" size={12} /></button>
        </span>
      </div>
    )
  }

  return (
    <>
      <SideSlot>
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto">
        <div className="side-group">
          <NavLabel action={<button className="ghost flex size-[22px] items-center justify-center" aria-label="Thêm account" title="Thêm account GitLab / GitHub" onClick={() => setAdding(true)}><Icon name="plus" size={13} /></button>}>Account</NavLabel>
          <button className={'nav-item' + (effective === 'all' ? ' on' : '')} aria-pressed={effective === 'all'} onClick={() => setAccount('all')}>
            <Icon name="merge" size={13} />Tất cả{effective === 'all' && <span className="nav-n">{all.length}</span>}
          </button>
          {accs.map((a) => (
            <div key={a.id} className="group relative">
              <button className={'nav-item' + (effective === a.id ? ' on' : '')} aria-pressed={effective === a.id} title={`${a.name}\n${a.baseUrl} · ${a.user}`} onClick={() => setAccount(a.id)}>
                <span className={'size-2 flex-none rounded-full ' + (a.provider === 'gitlab' ? 'bg-[#C9A8FF]' : 'bg-[#8FE0B0]')} />
                <span className="truncate">{a.name}</span>
                {effective === 'all' || effective === a.id ? <span className="nav-n group-hover:invisible">{all.filter((c) => c.accountId === a.id).length}</span> : null}
              </button>
              <button className={'ghost absolute right-1 top-0.5 flex h-[22px] items-center justify-center px-1 text-[11px] focus-visible:visible group-hover:visible ' + (confirmDel === a.id ? 'visible text-danger' : 'invisible')}
                aria-label={'Xóa account ' + a.name} title="Xóa account và token khỏi máy" onClick={() => void removeAccount(a.id)} onBlur={() => setConfirmDel(null)}>
                {confirmDel === a.id ? 'Xác nhận' : <Icon name="x" size={12} />}
              </button>
            </div>
          ))}
        </div>

        {projects.length > 0 && (
          <div className="side-group">
            <NavLabel>Project</NavLabel>
            <button className={'nav-item' + (!activeProject ? ' on' : '')} aria-pressed={!activeProject} onClick={() => setProject(null)}>
              <Icon name="folder" size={13} />Tất cả project<span className="nav-n">{projects.length}</span>
            </button>
            {pinnedProjects.length > 0 && <div className="px-2 pt-1.5 text-[10.5px] uppercase tracking-wide text-fg-mute">Đã ghim</div>}
            {pinnedProjects.map((p) => <ProjectItem key={p.key} p={p} />)}
            {pinnedProjects.length > 0 && otherProjects.length > 0 && <div className="px-2 pt-1.5 text-[10.5px] uppercase tracking-wide text-fg-mute">Khác</div>}
            {otherProjects.map((p) => <ProjectItem key={p.key} p={p} />)}
          </div>
        )}

        <div className="px-2 text-sm text-fg-mute">Chỉ đọc: xem MR / PR, CI, approve và thread review. Token lưu mã hóa trên máy.</div>
        </div>

        {hiddenArr.length > 0 && (
          <div className="flex-none border-t border-border bg-[var(--bg-chrome)] pt-1.5">
            {hiddenOpen && (
              <div className="mb-1 flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto" role="list" aria-label="Project đã ẩn">
                <button className="btn w-full !h-7 whitespace-nowrap" onClick={() => { setHiddenArr([]); setHiddenOpen(false) }}>Hiện tất cả ({hiddenArr.length})</button>
                {hiddenEntries.map((h) => (
                  <div role="listitem" key={h.key} className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] hover:bg-[#1F2124]">
                    <span className="min-w-0 flex-1 truncate" title={h.name}>{h.name}</span>
                    <button className="btn sm !h-6 whitespace-nowrap" aria-label={'Hiện lại ' + h.name} onClick={() => { const next = hiddenArr.filter((x) => x !== h.key); setHiddenArr(next); if (!next.length) setHiddenOpen(false) }}>Hiện</button>
                  </div>
                ))}
              </div>
            )}
            <button className={'nav-item w-full' + (hiddenOpen ? ' on' : '')} aria-expanded={hiddenOpen} onClick={() => setHiddenOpen(!hiddenOpen)} title="Danh sách project đã ẩn">
              <Icon name="x" size={13} />Project đã ẩn<span className="nav-n">{hiddenArr.length}</span>
            </button>
          </div>
        )}
      </SideSlot>

      {adding && <RemoteAccountModal onClose={() => setAdding(false)} onAdded={(a) => { accounts.reload(); setAccount(a.id) }} />}
      {picked && <RemoteDetailModal key={picked.key} cr={picked} onClose={() => setOpenKey(null)} />}

      <StatusSlot>
        <span className="sb-item"><span className={'dot ' + (crs.loading ? 'busy' : 'ok')} />{crs.loading ? 'Đang tải…' : `${list.length} MR / PR`}</span>
        {groupBy === 'project' && groups.length > 0 && <span>{groups.length} project</span>}
        {stats.threads > 0 && <span>{stats.threads} thread chưa resolve</span>}
        <span className="sb-end">{crs.data?.fetchedAt ? `Cập nhật ${relTime(crs.data.fetchedAt)} · ` : ''}tự làm mới mỗi {REFRESH_MS / 1000} giây</span>
      </StatusSlot>

      <div className="page" style={{ padding: '24px 28px', gap: 16 }}>
        <header className="page-h !items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1>Remotes</h1>
            <span className="text-[12px] text-fg-mute">Merge request / Pull request trên GitLab và GitHub, kèm trạng thái CI, approve và thread review</span>
          </div>
          <div className="flex flex-none items-center gap-2">
            <button className="btn whitespace-nowrap" onClick={() => setAdding(true)}><Icon name="plus" size={13} />Thêm account</button>
            <button className="btn whitespace-nowrap" onClick={crs.reload} disabled={crs.loading || !hasAccounts}><Icon name="refresh" size={13} spin={crs.loading} />Làm mới</button>
          </div>
        </header>

        {accounts.error && <div className="banner err" role="alert">Không đọc được danh sách account: {accounts.error}</div>}
        {accounts.loading && !accounts.data && <Spinner label="Đang tải…" />}

        {accounts.data && !hasAccounts && (
          <div className="flex flex-col items-center gap-3 rounded-[10px] border border-border bg-surface px-6 py-12 text-center">
            <Icon name="merge" size={28} />
            <b className="text-[15px]">Chưa có account nào</b>
            <p className="max-w-md text-[12.5px] leading-relaxed text-fg-mute">Thêm Personal Access Token của GitLab (kể cả bản tự host) hoặc GitHub để xem các MR / PR của bạn và người khác ngay trong DevDeck.</p>
            <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={13} />Thêm account</button>
          </div>
        )}

        {hasAccounts && <Segmented<'mr' | 'branches' | 'pipelines'> label="Chế độ xem" value={tab} onChange={setTab} options={[{ id: 'mr', label: 'MR / PR' }, { id: 'branches', label: 'Branches' }, { id: 'pipelines', label: 'Pipelines' }]} />}

        {hasAccounts && tab === 'branches' && <RemoteBranches projects={projects} accounts={accs} />}

        {hasAccounts && tab === 'pipelines' && <RemotePipelines projects={projects} accounts={accs} />}

        {hasAccounts && tab === 'mr' && (
          <>
            <KpiStrip label="Tóm tắt MR / PR">
              <Kpi label="Đang mở" value={stats.open} />
              <Kpi label="Cần tôi review" value={stats.review} valueColor={stats.review ? 'var(--ahead)' : undefined} />
              <Kpi label="Thread chưa resolve" value={stats.threads} valueColor={stats.threads ? 'var(--behind)' : undefined} />
              <Kpi label="CI lỗi" value={stats.ciFail} valueColor={stats.ciFail ? 'var(--danger)' : undefined} />
              <Kpi label="Có conflict" value={stats.conflict} valueColor={stats.conflict ? 'var(--danger)' : undefined} />
            </KpiStrip>

            <div className="flex flex-wrap items-center gap-2">
              <Segmented<CrScope> label="Phạm vi" value={scope} onChange={setScope} options={[{ id: 'mine', label: 'Của tôi' }, { id: 'review', label: 'Cần tôi review' }, { id: 'assigned', label: 'Gán cho tôi' }, { id: 'all', label: 'Tất cả' }]} />
              <Segmented<CrState> label="Trạng thái" value={state} onChange={setState} options={[{ id: 'opened', label: 'Open' }, { id: 'merged', label: 'Merged' }, { id: 'closed', label: 'Closed' }]} />
              <span className="ml-1 text-[12px] text-fg-mute">Nhóm theo</span>
              <Segmented<GroupBy> label="Nhóm theo" value={groupBy} onChange={setGroupBy} options={[{ id: 'project', label: 'Project' }, { id: 'target', label: 'Branch đích' }, { id: 'author', label: 'Tác giả' }, { id: 'none', label: 'Không' }]} />
              <input type="search" className="ml-auto !h-[30px] min-w-[200px] flex-1 sm:max-w-[320px]" placeholder="Tìm theo tiêu đề, branch, số, tác giả…" aria-label="Tìm MR / PR" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>

            {activeEntry && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-fg-mute">Đang lọc project:</span>
                <button className="chip chip-info inline-flex items-center gap-1.5" onClick={() => setProject(null)} title="Bỏ lọc project"><b>{activeEntry.name}</b><Icon name="x" size={11} /></button>
                {activeEntry.parent && <span className="mono truncate text-fg-mute">{activeEntry.parent}</span>}
              </div>
            )}

            {crs.error && <div className="banner err" role="alert">Không tải được danh sách: {crs.error}</div>}
            {crs.data?.errors.map((e) => <div key={e.accountId} className="banner err" role="alert">{e.name}: {e.error}</div>)}
            {crs.loading && <div className={list.length ? 'spinner-wrap compact' : undefined}>{list.length ? <><span className="spinner" aria-hidden="true" /><span className="muted">Đang cập nhật MR / PR…</span></> : <Spinner label="Đang lấy MR / PR từ remote…" />}</div>}
            {!crs.loading && crs.data && !list.length && !crs.data.errors.length && (
              <div className="banner">{q ? 'Không có MR / PR nào khớp từ khóa.' : 'Không có MR / PR nào trong mục này.'}</div>
            )}

            {groups.map((g) => (
              groupBy === 'none' ? (
                <div key={g.key} className="overflow-hidden rounded-[10px] border border-border bg-surface" role="list" aria-label="Danh sách MR / PR">
                  {g.items.map((c) => <div role="listitem" key={c.key}><CrRow c={c} hideProject={false} onOpen={() => setOpenKey(c.key)} /></div>)}
                </div>
              ) : (
                <GroupBlock key={g.key} g={g} by={groupBy} collapsed={collapsed.has(groupBy + ':' + g.key)} pinned={pinned.has(g.key)} expanded={expandedGroups.includes(g.key)}
                  onToggle={() => toggleIn(collapsedArr, setCollapsedArr, groupBy + ':' + g.key)} onPin={() => toggleIn(pinnedArr, setPinnedArr, g.key)}
                  onHide={() => hideProject(g.key, g.title)} onExpand={() => setExpandedGroups((a) => (a.includes(g.key) ? a.filter((x) => x !== g.key) : [...a, g.key]))}
                  onOpen={(c) => setOpenKey(c.key)} />
              )
            ))}
            {list.length > 0 && <div className="text-[12px] text-fg-mute">{list.length} mục · {[...new Set(list.map((c) => PROVIDER_LABEL[c.provider]))].join(', ')} · bấm một dòng để xem thread review</div>}
          </>
        )}
      </div>
    </>
  )
}
