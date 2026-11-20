import type { RepoSummary } from '../types'

export const changeCount = (r: RepoSummary) => r.staged + r.modified + r.untracked + r.conflicts
export const isDirty = (r: RepoSummary) => changeCount(r) > 0
export const isOut = (r: RepoSummary) => r.ahead > 0 || r.behind > 0

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

export interface TreeNode {
  key: string
  name: string
  children: TreeNode[]
  repo?: RepoSummary
  count: number
  dirty: number
}

/** Gom repo thành cây thư mục theo các thư mục gốc đã cấu hình. */
export function buildTree(repos: RepoSummary[], roots: string[]): TreeNode[] {
  const rs = roots.map(norm).sort((a, b) => b.length - a.length)
  const tops = new Map<string, TreeNode>()
  const mk = (key: string, name: string): TreeNode => ({ key, name, children: [], count: 0, dirty: 0 })

  for (const r of repos) {
    const p = norm(r.path)
    const root = rs.find((x) => p.toLowerCase().startsWith(x.toLowerCase() + '/'))
    const base = root ?? p.split('/').slice(0, -1).join('/')
    const rel = (root ? p.slice(root.length + 1) : p.slice(base.length + 1)).split('/').filter(Boolean)

    let top = tops.get(base)
    if (!top) { top = mk(base, base || '/'); tops.set(base, top) }
    let cur = top
    let key = base
    for (const seg of rel) {
      key += '/' + seg
      let next = cur.children.find((c) => c.key === key)
      if (!next) { next = mk(key, seg); cur.children.push(next) }
      cur = next
    }
    cur.repo = r
  }

  const finish = (n: TreeNode): TreeNode => {
    n.children = n.children.map(finish).sort((a, b) => a.name.localeCompare(b.name))
    n.count = (n.repo ? 1 : 0) + n.children.reduce((s, c) => s + c.count, 0)
    n.dirty = (n.repo && isDirty(n.repo) ? 1 : 0) + n.children.reduce((s, c) => s + c.dirty, 0)
    // Gộp chuỗi thư mục chỉ có một con: a > b > c thành "a/b/c"
    while (!n.repo && n.children.length === 1 && !n.children[0].repo && n.children[0].children.length) {
      const c = n.children[0]
      n.name += '/' + c.name
      n.key = c.key
      n.children = c.children
    }
    return n
  }
  return [...tops.values()].map(finish).sort((a, b) => a.name.localeCompare(b.name))
}
