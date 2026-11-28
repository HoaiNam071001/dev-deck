import { useEffect, useState } from 'react'
import { api } from '../api'
import type { JiraIssue } from '../types'
import { Modal } from './Modal'
import { Chip, type Tone } from './ui'

const TONE: Record<JiraIssue['category'], Tone> = { todo: 'muted', doing: 'info', done: 'ok' }

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
        {safeUrl(issue.url) && <a href={safeUrl(issue.url)} target="_blank" rel="noreferrer noopener" className="text-[12.5px] text-accent">Mở trong Jira ↗</a>}
      </div>
    </Modal>
  )
}
