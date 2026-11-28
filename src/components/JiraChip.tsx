import { useState } from 'react'
import { api } from '../api'
import { JIRA_TONE, useJiraIssues } from '../lib/useJiraIssues'
import { toast } from '../lib/store'
import type { JiraIssue } from '../types'
import { ContextMenu } from './ContextMenu'
import { JiraPanel } from './JiraPanel'
import { Chip } from './ui'

/** Chip chỉ để xem (không bấm được), dùng trong hàng danh sách vốn đã là nút. */
export function JiraTags({ texts, compact }: { texts: (string | null | undefined)[]; compact?: boolean }) {
  const issues = useJiraIssues(texts)
  return <>{issues.map((i) => <Chip key={i.key} tone={JIRA_TONE[i.category]} title={`${i.summary} · ${i.status}`}><span className="font-mono">{i.key}</span>{!compact && <> · {i.status}</>}</Chip>)}</>
}

export function JiraChip({ issue }: { issue: JiraIssue }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => setOpen(true)} title={`${issue.summary} · ${issue.status}`}>
        <Chip tone={JIRA_TONE[issue.category]}><span className="font-mono">{issue.key}</span> · {issue.status}</Chip>
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

/** Mã ticket bấm được, mở panel chi tiết. */
export function JiraKey({ issue }: { issue: JiraIssue }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="mono cursor-pointer border-0 bg-transparent p-0 text-left text-[12.5px] font-semibold text-primary hover:underline" onClick={() => setOpen(true)} title="Xem chi tiết">{issue.key}</button>
      {open && <JiraPanel issue={issue} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Trạng thái ticket. Account đã bật ghi thì bấm vào để đổi trạng thái ngay (bước chuyển lấy từ Jira). */
export function JiraStatus({ issue, writable, onChanged }: { issue: JiraIssue; writable: boolean; onChanged: () => void }) {
  const [menu, setMenu] = useState<{ id: string; name: string; to: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const chip = <Chip tone={JIRA_TONE[issue.category]}>{issue.status}</Chip>
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
        <Chip tone={JIRA_TONE[issue.category]}>{issue.status} ▾</Chip>
      </button>
      {menu && <ContextMenu label={'Đổi trạng thái ' + issue.key} onClose={() => setMenu(null)}
        items={menu.length ? menu.map((t) => ({ label: t.to && t.to !== t.name ? `${t.name} → ${t.to}` : t.name, run: () => void go(t) })) : [{ label: 'Không có bước chuyển nào', disabled: true, run: () => {} }]} />}
    </span>
  )
}
