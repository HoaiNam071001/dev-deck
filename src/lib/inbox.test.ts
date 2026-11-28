import { describe, expect, it } from 'vitest'
import { buildInbox } from './inbox'
import type { RepoSummary } from '../types'

const repo = (o: Partial<RepoSummary>): RepoSummary => ({ path: '/r/a', name: 'a', branch: 'main', detached: false, head: 'x', upstream: 'origin/main', ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, conflicts: 0, branches: [], lastCommit: null, ...o })
const none = { reviewQueue: { waiting: 0, late: 0 }, remoteUnread: 0, jiraUnread: 0 }

describe('buildInbox', () => {
  it('rỗng khi không có việc', () => expect(buildInbox({ repos: [repo({})], ...none })).toEqual([]))
  it('sắp gấp trước: review trễ > ticket > xung đột > push > pull > chưa commit', () => {
    const items = buildInbox({
      repos: [repo({ path: '/1', name: 'p', modified: 2 }), repo({ path: '/2', name: 'q', behind: 1 }), repo({ path: '/3', name: 'r', ahead: 2 }), repo({ path: '/4', name: 's', conflicts: 1 })],
      reviewQueue: { waiting: 3, late: 1 }, remoteUnread: 0, jiraUnread: 2,
    })
    expect(items.map((i) => i.source + ':' + i.priority)).toEqual(['remotes:1', 'jira:3', 'git:4', 'git:5', 'git:6', 'git:7'])
  })
  it('id đổi khi số liệu đổi (mục đã xong tự hiện lại)', () => {
    const a = buildInbox({ repos: [repo({ ahead: 1 })], ...none })[0].id
    const b = buildInbox({ repos: [repo({ ahead: 2 })], ...none })[0].id
    expect(a).not.toBe(b)
  })
})
