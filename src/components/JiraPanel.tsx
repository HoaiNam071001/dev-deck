import { useState } from 'react'
import { api, useLoad } from '../api'
import { branchName, DEFAULT_BRANCH_TEMPLATE } from '../lib/jiraBranch'
import { usePersisted } from '../lib/persist'
import { suggestTransition } from '../lib/jiraSuggest'
import { fmtDuration, parseDuration } from '../lib/jiraTime'
import { JIRA_TONE } from '../lib/useJiraIssues'
import { navigate } from '../lib/router'
import { openRemoteCr } from '../lib/remoteWatch'
import { setState, toast } from '../lib/store'
import type { JiraIssue } from '../types'
import { Modal } from './Modal'
import { Chip } from './ui'

const safeUrl = (u: string) => /^https?:\/\//i.test(u) ? u : undefined

export function JiraPanel({ issue, onClose }: { issue: JiraIssue; onClose: () => void }) {
  const row = (k: string, v: string) => v ? <div className="flex gap-2 text-[12.5px]"><span className="w-20 flex-none text-fg-mute">{k}</span><span className="min-w-0">{v}</span></div> : null
  return (
    <Modal onClose={onClose} titleId="jira-title" header={<h2 id="jira-title" className="flex min-w-0 items-center gap-2"><span className="mono flex-none">{issue.key}</span><span className="truncate">{issue.summary}</span></h2>}>
      <div className="flex flex-col gap-2 p-4">
        <div><Chip tone={JIRA_TONE[issue.category]}>{issue.status}</Chip></div>
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
  const [tpl, setTpl] = usePersisted<string>('devdeck.jira.branchTemplate', DEFAULT_BRANCH_TEMPLATE, (v) => typeof v === 'string')
  const [typed, setTyped] = useState<string | null>(null)
  const name = typed ?? branchName(issue, tpl)
  const setName = setTyped
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
                <label className="flex items-center gap-2 text-[11.5px] text-fg-mute">Mẫu
                  <input className="mono min-w-0 flex-1" value={tpl} onChange={(e) => { setTpl(e.target.value); setTyped(null) }} aria-label="Mẫu tên nhánh" title="Dùng {type} {key} {slug}; áp dụng cho mọi ticket" spellCheck={false} />
                </label>
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
  const crStates = useLoad(async () => {
    if (!acc?.write || !(await api.remoteAccounts()).length) return []
    const re = new RegExp(`(^|[^A-Za-z0-9])${issue.key}(?!\\d)`, 'i')
    const [o, m] = await Promise.all([api.changeRequests('all', 'mine', 'opened'), api.changeRequests('all', 'mine', 'merged')])
    return o.items.concat(m.items).filter((c) => re.test(c.title) || re.test(c.source)).map((c) => c.state as string)
  }, [acc?.write, issue.key], 0).data ?? []
  const sug = suggestTransition(trans.data ?? [], issue.status, crStates)
  const [tid, setTid] = useState('')
  const [text, setText] = useState('')
  const [dur, setDur] = useState('')
  const [busy, setBusy] = useState(false)
  if (!acc) return null
  if (!acc.write) return <div className="border-t border-border pt-2 text-[12px] text-fg-mute">Account này đang chỉ đọc. Bật "cho phép ghi" ở trang Jira để chuyển trạng thái, comment, ghi thời gian.</div>
  const wt = useLoad(() => api.jiraWorktime(issue.key), [issue.key], 0).data
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
      {sug && (
        <div className="flex items-center gap-2 rounded-md border border-accent/35 bg-accent/10 px-2.5 py-1.5">
          <span className="min-w-0 flex-1">{sug.reason}: chuyển sang <b>{sug.transition.to || sug.transition.name}</b>?</span>
          <button className="btn sm" disabled={busy} onClick={() => void run('Đã chuyển trạng thái', { action: 'transition', key: issue.key, account: issue.accountId, transitionId: sug.transition.id })}>Chuyển</button>
        </div>
      )}
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
        {wt && wt.seconds > 0 && <button className="btn sm ml-auto" title={`Ước lượng từ ${wt.commits} commit của bạn trên nhánh ticket (${wt.sessions} phiên làm việc); sửa lại nếu không đúng`} onClick={() => setDur(fmtDuration(wt.seconds))}>Gợi ý {fmtDuration(wt.seconds)}</button>}
        <input className={'mono w-24 ' + (wt && wt.seconds > 0 ? '' : 'ml-auto')} value={dur} onChange={(e) => setDur(e.target.value)} placeholder="1h30m" aria-label="Thời gian làm" spellCheck={false} />
        <button className="btn sm" disabled={busy || secs === null} title={secs === null ? 'Nhập dạng 1h30m, 45m, 2h (1 phút – 24 giờ)' : undefined} onClick={() => void run('Đã ghi thời gian', { action: 'worklog', key: issue.key, account: issue.accountId, seconds: secs! }, () => setDur(''))}>Ghi giờ</button>
      </div>
    </div>
  )
}
