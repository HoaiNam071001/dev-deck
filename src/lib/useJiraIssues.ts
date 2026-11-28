import { useEffect, useState } from 'react'
import { api } from '../api'
import type { JiraIssue } from '../types'
import type { Tone } from '../components/ui'

export const JIRA_TONE: Record<JiraIssue['category'], Tone> = { todo: 'muted', doing: 'info', done: 'ok' }

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
      void Promise.all(Array.from({ length: Math.ceil(keys.length / 50) }, (_, n) => api.jiraIssues(keys.slice(n * 50, n * 50 + 50)).catch(() => null)))
        .then((parts) => {
          // Lần gọi lỗi (null) thì không nhớ kết quả, để lần sau thử lại thay vì ẩn chip cả phút
          const got = new Map(parts.flatMap((p) => p ?? []).map((i) => [i.key, i]))
          const failed = parts.some((p) => p === null)
          for (const [k, waiters] of batch) { const issue = got.get(k) ?? null; if (issue || !failed) known.set(k, { at: Date.now(), issue }); waiters.forEach((w) => w(issue)) }
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
