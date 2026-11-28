import { useEffect, useState } from 'react'
import { api, useLoad } from '../api'
import { branchName } from '../lib/jiraBranch'
import { parseDuration } from '../lib/jiraTime'
import { navigate } from '../lib/router'
import { openRemoteCr } from '../lib/remoteWatch'
import { setState, toast } from '../lib/store'
import type { JiraIssue } from '../types'
import { Modal } from './Modal'
import { ContextMenu } from './ContextMenu'
import { Chip, type Tone } from './ui'

export const TONE: Record<JiraIssue['category'], Tone> = { todo: 'muted', doing: 'info', done: 'ok' }

const KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g
const TTL = 60000
const known = new Map<string, { at: number; issue: JiraIssue | null }>()
let queue = new Map<string, ((i: JiraIssue | null) => void)[]>()
let timer: ReturnType<typeof setTimeout> | null = null

/** Gom mọi yêu cầu ticket trong 30ms thành một lần gọi (server chỉ trả mã thuộc project có thật). */
function fetchIssue(key: string): Promise<JiraIssue | null> {
  const c = known.get(key)
  if (c && Date.now() - c.at < TTL) return Promise.resolve(c.issue)
  return new Promise((res) => {
    queue.set(key, [...(queue.get(key) ?? []), res])
    timer ??= setTimeout(() => {
      const batch = queue; queue = new Map(); timer = null
      const keys = [...batch.keys()]
      void Promise.all(Array.from({ length: Math.ceil(keys.length / 50) }, (_, n) => api.jiraIssues(keys.slice(n * 50, n * 50 + 50)).catch(() => [] as JiraIssue[])))
        .then((parts) => {
          const got = new Map(parts.flat().map((i) => [i.key, i]))
          for (const [k, waiters] of batch) { const issue = got.get(k) ?? null; known.set(k, { at: Date.now(), issue }); waiters.forEach((w) => w(issue)) }
        })
    }, 30)
  })
}

/** Ticket Jira nhận từ các đoạn chữ (tên nhánh, tiêu đề MR). Không có account Jira hoặc mã không thuộc project nào thì trả rỗng. */
export function useJiraIssues(texts: (string | null | undefined)[]): JiraIssue[] {
  const keys = [...new Set(texts.flatMap((t) => (t ? t.match(KEY_RE) ?? [] : [])))].slice(0, 10)
  const id = keys.join(',')
  const [issues, setIssues] = useState<JiraIssue[]>([])
  useEffect(() => {
    let live = true
    if (!id) { setIssues([]); return }
    void Promise.all(id.split(',').map(fetchIssue)).then((r) => { if (live) setIssues(r.filter((x): x is JiraIssue => !!x)) })
    return () => { live = false }
  }, [id])
  return issues
}

/** Chip chỉ để xem (không bấm được), dùng trong hàng danh sách vốn đã là nút. */
export function JiraTags({ texts }: { texts: (string | null | undefined)[] }) {
  const issues = useJiraIssues(texts)
  return <>{issues.map((i) => <Chip key={i.key} tone={TONE[i.category]} title={`${i.summary} · ${i.status}`}><span className="font-mono">{i.key}</span> · {i.status}</Chip>)}</>
}

export function JiraChip({ issue }: { issue: JiraIssue }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => setOpen(true)} title={`${issue.summary} · ${issue.status}`}>
        <Chip tone={TONE[issue.category]}><span className="font-mono">{issue.key}</span> · {issue.status}</Chip>
      </button>
      {open && <JiraPanel issue={issue} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Chip cho mọi ticket tìm thấy trong các đoạn chữ. */
export function JiraChips({ texts }: { texts: (string | null | undefined)[] }) {
  const issues = useJiraIssues(texts)
  if (!issues.length) return null
  return <span className="inline-flex flex-wrap items-center gap-1.5">{issues.map((i) => <JiraChip key={i.key} issue={i} />)}</span>
}

const safeUrl = (u: string) => /^https?:\/\//i.test(u) ? u : undefined

export function JiraPanel({ issue, onClose }: { issue: JiraIssue; onClose: () => void }) {
  const row = (k: string, v: string) => v ? <div className="flex gap-2 text-[12.5px]"><span className="w-20 flex-none text-fg-mute">{k}</span><span className="min-w-0">{v}</span></div> : null
  return (
    <Modal onClose={onClose} titleId="jira-title" header={<h2 id="jira-title" className="flex min-w-0 items-center gap-2"><span className="mono flex-none">{issue.key}</span><span className="truncate">{issue.summary}</span></h2>}>
      <div className="flex flex-col gap-2 p-4">
        <div><Chip tone={TONE[issue.category]}>{issue.status}</Chip></div>
        {row('Người nhận', issue.assignee || 'Chưa giao')}
        {row('Ưu tiên', issue.priority)}
        {row('Loại', issue.type)}
        {row('Sprint', issue.sprint)}
        {issue.description && <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap border-t border-border pt-2 font-sans text-[12.5px] text-fg-soft">{issue.description}</pre>}
        <JiraContinue issue={issue} onDone={onClose} />
        <JiraWrite issue={issue} />
        {safeUrl(issue.url) && <a href={safeUrl(issue.url)} target="_blank" rel="noreferrer noopener" className="text-[12.5px] text-accent">Mở trong Jira ↗</a>}
      </div>
    </Modal>
  )
}

/** "Làm tiếp": nhánh local và MR / PR đã nối với ticket; chưa có nhánh thì tạo từ ticket. */
function JiraContinue({ issue, onDone }: { issue: JiraIssue; onDone: () => void }) {
  const links = useLoad(() => api.jiraLinks(issue.key), [issue.key], 0)
  const crs = useLoad(async () => {
    if (!(await api.remoteAccounts()).length) return []
    const [a, b] = await Promise.all([api.changeRequests('all', 'mine', 'opened'), api.changeRequests('all', 'review', 'opened')])
    const re = new RegExp(`(^|[^A-Za-z0-9])${issue.key}(?!\\d)`, 'i')
    const seen = new Map(a.items.concat(b.items).filter((c) => re.test(c.title) || re.test(c.source)).map((c) => [c.key, c]))
    return [...seen.values()]
  }, [issue.key], 0)
  const [name, setName] = useState(() => branchName(issue))
  const [repo, setRepo] = useState('')
  const [busy, setBusy] = useState(false)
  const repos = links.data ?? []
  const pick = repo || (repos.find((r) => r.suggested)?.path ?? repos[0]?.path ?? '')
  const have = repos.flatMap((r) => r.branches.map((b) => ({ path: r.path, repo: r.name, branch: b })))

  const open = (path: string) => { setState({ selected: path, wantTab: 'branches' }); navigate('/git'); onDone() }
  const create = async () => {
    if (!pick) return
    setBusy(true)
    try {
      await api.action(pick, 'createBranch', { name: name.trim() })
      toast({ kind: 'ok', title: 'Đã tạo nhánh', detail: name.trim() })
      open(pick)
    } catch (e) { toast({ kind: 'err', title: 'Không tạo được nhánh', detail: (e as Error).message }) }
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2 text-[12.5px]">
      <span className="font-semibold">Làm tiếp</span>
      {links.loading && !links.data && <span className="text-fg-mute">Đang tìm nhánh…</span>}
      {have.map((h) => <button key={h.path + h.branch} className="btn sm justify-start" onClick={() => open(h.path)} title={h.path}><span className="font-mono">{h.branch}</span><span className="text-fg-mute"> · {h.repo}</span></button>)}
      {(crs.data ?? []).map((c) => <button key={c.key} className="btn sm justify-start" onClick={() => { openRemoteCr(c.key); onDone() }}>{c.project} · {c.title}</button>)}
      {!have.length && !links.loading && (
        <div className="flex flex-col gap-1.5">
          <span className="text-fg-mute">Chưa có nhánh local cho ticket này.</span>
          {repos.length > 0
            ? <>
                <select value={pick} onChange={(e) => setRepo(e.target.value)} aria-label="Repo tạo nhánh">{repos.map((r) => <option key={r.path} value={r.path}>{r.name}{r.suggested ? ' (cùng project)' : ''}</option>)}</select>
                <input className="mono" value={name} onChange={(e) => setName(e.target.value)} aria-label="Tên nhánh" spellCheck={false} />
                <button className="btn primary self-start" disabled={busy || !name.trim()} onClick={() => void create()}>Tạo nhánh và mở</button>
              </>
            : <span className="text-fg-mute">Chưa có repo nào có nhánh cùng project {issue.key.slice(0, issue.key.lastIndexOf('-'))}; hãy mở repo rồi tạo nhánh ở tab Nhánh với tên <span className="font-mono">{name}</span>.</span>}
        </div>
      )}
    </div>
  )
}

/** Chuyển trạng thái, comment, ghi thời gian: chỉ hiện khi account của ticket đã bật ghi. */
function JiraWrite({ issue }: { issue: JiraIssue }) {
  const acc = useLoad(api.jiraAccounts, [], 0, 'jiraAccounts').data?.find((a) => a.id === issue.accountId)
  const trans = useLoad(() => (acc?.write ? api.jiraTransitions(issue.key, issue.accountId) : Promise.resolve([])), [acc?.write, issue.key], 0)
  const [tid, setTid] = useState('')
  const [text, setText] = useState('')
  const [dur, setDur] = useState('')
  const [busy, setBusy] = useState(false)
  if (!acc) return null
  if (!acc.write) return <div className="border-t border-border pt-2 text-[12px] text-fg-mute">Account này đang chỉ đọc. Bật "cho phép ghi" ở trang Jira để chuyển trạng thái, comment, ghi thời gian.</div>
  const secs = parseDuration(dur)
  const run = async (label: string, body: Parameters<typeof api.jiraAct>[0], done?: () => void) => {
    setBusy(true)
    try { await api.jiraAct(body); toast({ kind: 'ok', title: label, detail: issue.key }); done?.() }
    catch (e) { toast({ kind: 'err', title: 'Không thực hiện được', detail: (e as Error).message }) }
    setBusy(false)
  }
  const t = (trans.data ?? []).find((x) => x.id === tid)
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2 text-[12.5px]">
      <span className="font-semibold">Cập nhật ticket</span>
      <div className="flex items-center gap-2">
        <select value={tid} onChange={(e) => setTid(e.target.value)} aria-label="Chuyển trạng thái" className="min-w-0 flex-1">
          <option value="">Chuyển trạng thái…</option>
          {(trans.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}{x.to && x.to !== x.name ? ` → ${x.to}` : ''}</option>)}
        </select>
        <button className="btn sm" disabled={busy || !t} onClick={() => void run('Đã chuyển trạng thái', { action: 'transition', key: issue.key, account: issue.accountId, transitionId: tid }, () => setTid(''))}>Chuyển</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Viết comment…" aria-label="Comment" maxLength={20000} />
      <div className="flex items-center gap-2">
        <button className="btn sm" disabled={busy || !text.trim()} onClick={() => void run('Đã gửi comment', { action: 'comment', key: issue.key, account: issue.accountId, body: text }, () => setText(''))}>Gửi comment</button>
        <input className="mono ml-auto w-24" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="1h30m" aria-label="Thời gian làm" spellCheck={false} />
        <button className="btn sm" disabled={busy || secs === null} title={secs === null ? 'Nhập dạng 1h30m, 45m, 2h (1 phút – 24 giờ)' : undefined} onClick={() => void run('Đã ghi thời gian', { action: 'worklog', key: issue.key, account: issue.accountId, seconds: secs! }, () => setDur(''))}>Ghi giờ</button>
      </div>
    </div>
  )
}

/** Mã ticket bấm được, mở panel chi tiết. */
export function JiraKey({ issue }: { issue: JiraIssue }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="mono cursor-pointer border-0 bg-transparent p-0 text-left text-[12.5px] font-semibold text-accent hover:underline" onClick={() => setOpen(true)} title="Xem chi tiết">{issue.key}</button>
      {open && <JiraPanel issue={issue} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Trạng thái ticket. Account đã bật ghi thì bấm vào để đổi trạng thái ngay (bước chuyển lấy từ Jira). */
export function JiraStatus({ issue, writable, onChanged }: { issue: JiraIssue; writable: boolean; onChanged: () => void }) {
  const [menu, setMenu] = useState<{ id: string; name: string; to: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const chip = <Chip tone={TONE[issue.category]}>{issue.status}</Chip>
  if (!writable) return <span title="Bật ghi cho account ở đầu trang để đổi trạng thái tại đây">{chip}</span>
  const open = async () => {
    if (menu) { setMenu(null); return }
    setBusy(true)
    try { setMenu(await api.jiraTransitions(issue.key, issue.accountId)) }
    catch (e) { toast({ kind: 'err', title: 'Không lấy được các bước chuyển', detail: (e as Error).message }) }
    setBusy(false)
  }
  const go = async (t: { id: string; name: string; to: string }) => {
    try { await api.jiraAct({ action: 'transition', key: issue.key, account: issue.accountId, transitionId: t.id }); toast({ kind: 'ok', title: `${issue.key} → ${t.to || t.name}` }); onChanged() }
    catch (e) { toast({ kind: 'err', title: 'Không đổi được trạng thái', detail: (e as Error).message }) }
  }
  return (
    <span className="relative inline-block">
      <button type="button" className="cursor-pointer border-0 bg-transparent p-0" disabled={busy} onClick={() => void open()} aria-haspopup="menu" aria-expanded={!!menu} title="Đổi trạng thái">
        <Chip tone={TONE[issue.category]}>{issue.status} ▾</Chip>
      </button>
      {menu && <ContextMenu label={'Đổi trạng thái ' + issue.key} onClose={() => setMenu(null)}
        items={menu.length ? menu.map((t) => ({ label: t.to && t.to !== t.name ? `${t.name} → ${t.to}` : t.name, run: () => void go(t) })) : [{ label: 'Không có bước chuyển nào', disabled: true, run: () => {} }]} />}
    </span>
  )
}
