import { useState } from 'react'
import { api, useLoad } from '../api'
import type { JiraIssue } from '../types'
import { Modal } from './Modal'
import { Chip, type Tone } from './ui'

const TONE: Record<JiraIssue['category'], Tone> = { todo: 'muted', doing: 'info', done: 'ok' }

/** Ticket Jira nhận từ các đoạn chữ (tên nhánh, tiêu đề / mô tả MR). Không có account Jira thì trả rỗng, không báo lỗi. */
export function useJiraIssues(texts: (string | null | undefined)[]): JiraIssue[] {
  const joined = texts.filter(Boolean).join('\n')
  const accounts = useLoad(api.jiraAccounts, [], 0, 'jiraAccounts').data
  const has = (accounts?.length ?? 0) > 0
  const issues = useLoad(async () => {
    if (!has || !joined) return []
    const keys = (await api.jiraExtract([joined]))[0] ?? []
    return keys.length ? api.jiraIssues(keys.slice(0, 10)) : []
  }, [has, joined], 0)
  return issues.data ?? []
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
        {safeUrl(issue.url) && <a href={safeUrl(issue.url)} target="_blank" rel="noreferrer noopener" className="text-[12.5px] text-accent">Mở trong Jira ↗</a>}
      </div>
    </Modal>
  )
}
