import type { ChangeRequest } from '../types'
import { unresolved } from '../components/RemoteBits'

export type GroupBy = 'project' | 'target' | 'author' | 'none'
export const GROUP_BYS: GroupBy[] = ['project', 'target', 'author', 'none']

/** Khóa project duy nhất giữa các account (cùng đường dẫn ở hai account vẫn là hai project). */
export const projectKey = (c: Pick<ChangeRequest, 'accountId' | 'project'>) => `${c.accountId}|${c.project}`

/** "a/b/c" → { name: "c", parent: "a/b" }. */
export function splitPath(p: string) {
  const i = p.lastIndexOf('/')
  return i < 0 ? { name: p, parent: '' } : { name: p.slice(i + 1), parent: p.slice(0, i) }
}

export interface CrGroup {
  key: string
  title: string
  sub: string
  provider: ChangeRequest['provider'] | null
  items: ChangeRequest[]
  threads: number
  ciFail: number
  conflicts: number
  newest: string
}

const keyOf: Record<Exclude<GroupBy, 'none'>, (c: ChangeRequest) => [string, string, string]> = {
  project: (c) => { const s = splitPath(c.project); return [projectKey(c), s.name, s.parent] },
  target: (c) => [c.target, c.target, ''],
  author: (c) => [c.author.username || c.author.name, c.author.name, c.author.username],
}

/** Gom MR/PR theo tiêu chí. Thứ tự nhóm: đã ghim trước, rồi nhóm cần chú ý nhất (thread chưa resolve, CI lỗi), rồi mới cập nhật. */
export function groupChangeRequests(list: ChangeRequest[], by: GroupBy, pinned: Set<string>): CrGroup[] {
  if (by === 'none') return list.length ? [stats({ key: 'all', title: '', sub: '', provider: null, items: list })] : []
  const map = new Map<string, CrGroup>()
  for (const c of list) {
    const [key, title, sub] = keyOf[by](c)
    let g = map.get(key)
    if (!g) { g = stats({ key, title, sub, provider: by === 'project' ? c.provider : null, items: [] }); map.set(key, g) }
    g.items.push(c)
  }
  const groups = [...map.values()].map((g) => stats(g))
  const attn = (g: CrGroup) => g.threads + g.ciFail * 2 + g.conflicts
  return groups.sort((a, b) =>
    Number(pinned.has(b.key)) - Number(pinned.has(a.key)) || attn(b) - attn(a) || b.newest.localeCompare(a.newest) || a.title.localeCompare(b.title))
}

function stats(g: Omit<CrGroup, 'threads' | 'ciFail' | 'conflicts' | 'newest'> & Partial<CrGroup>): CrGroup {
  const open = g.items.filter((c) => c.state === 'opened')
  return {
    ...g,
    threads: open.reduce((s, c) => s + unresolved(c), 0),
    ciFail: open.filter((c) => c.ci === 'failed').length,
    conflicts: open.filter((c) => c.conflict).length,
    newest: g.items.reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), ''),
  }
}

export interface ProjectEntry { key: string; name: string; parent: string; provider: ChangeRequest['provider']; accountId: string; count: number; threads: number; ciFail: number }

/** Danh sách project xuất hiện trong dữ liệu hiện có, cho panel trái. */
export function projectsOf(list: ChangeRequest[]): ProjectEntry[] {
  const map = new Map<string, ProjectEntry>()
  for (const c of list) {
    const k = projectKey(c)
    let e = map.get(k)
    if (!e) { const s = splitPath(c.project); e = { key: k, name: s.name, parent: s.parent, provider: c.provider, accountId: c.accountId, count: 0, threads: 0, ciFail: 0 }; map.set(k, e) }
    e.count++
    if (c.state === 'opened') { e.threads += unresolved(c); if (c.ci === 'failed') e.ciFail++ }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
