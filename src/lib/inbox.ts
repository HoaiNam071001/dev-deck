import type { Route } from './router'
import type { RepoSummary } from '../types'
import { changeCount, isDirty } from './repo'

export type InboxSource = 'git' | 'remotes' | 'jira'
export interface InboxItem {
  /** Ổn định theo nội dung: đổi số liệu thì đổi id nên mục "đã xong" tự hiện lại. */
  id: string
  source: InboxSource
  title: string
  sub: string
  to: Route
  /** Số nhỏ = gấp hơn. */
  priority: number
  /** Có khi mở được thẳng một repo. */
  repo?: string
}

export interface InboxInput {
  repos: RepoSummary[]
  reviewQueue: { waiting: number; late: number }
  remoteUnread: number
  jiraUnread: number
}

/** Gom việc cần xử lý từ dữ liệu đã có sẵn (không gọi mạng, không quét). Gấp trước. */
export function buildInbox({ repos, reviewQueue, remoteUnread, jiraUnread }: InboxInput): InboxItem[] {
  const out: InboxItem[] = []
  if (reviewQueue.late > 0) out.push({ id: `rq-late:${reviewQueue.late}`, source: 'remotes', title: `${reviewQueue.late} MR / PR chờ bạn review quá 24 giờ`, sub: `${reviewQueue.waiting} đang chờ tất cả`, to: '/remotes', priority: 1 })
  else if (reviewQueue.waiting > 0) out.push({ id: `rq:${reviewQueue.waiting}`, source: 'remotes', title: `${reviewQueue.waiting} MR / PR chờ bạn review`, sub: 'Mở hàng đợi review', to: '/remotes', priority: 2 })
  if (jiraUnread > 0) out.push({ id: `jira:${jiraUnread}`, source: 'jira', title: `${jiraUnread} ticket có thay đổi chưa xem`, sub: 'Mở mục "Có gì mới"', to: '/jira', priority: 3 })
  if (remoteUnread > 0) out.push({ id: `rt:${remoteUnread}`, source: 'remotes', title: `${remoteUnread} thread review mới`, sub: 'Trên MR / PR của bạn', to: '/remotes', priority: 3 })
  for (const r of repos) {
    if (r.conflicts > 0) out.push({ id: `git-conf:${r.path}:${r.conflicts}`, source: 'git', title: `${r.name}: ${r.conflicts} tệp xung đột`, sub: r.branch ?? 'detached', to: '/git', priority: 4, repo: r.path })
    else if (r.ahead > 0) out.push({ id: `git-push:${r.path}:${r.ahead}`, source: 'git', title: `${r.name}: ${r.ahead} commit chưa push`, sub: r.branch ?? 'detached', to: '/git', priority: 5, repo: r.path })
    else if (r.behind > 0) out.push({ id: `git-pull:${r.path}:${r.behind}`, source: 'git', title: `${r.name}: sau remote ${r.behind} commit`, sub: r.branch ?? 'detached', to: '/git', priority: 6, repo: r.path })
    if (!r.conflicts && isDirty(r)) out.push({ id: `git-dirty:${r.path}:${changeCount(r)}`, source: 'git', title: `${r.name}: ${changeCount(r)} thay đổi chưa commit`, sub: r.branch ?? 'detached', to: '/git', priority: 7, repo: r.path })
  }
  return out.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
}
