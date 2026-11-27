import type { RepoSummary } from '../types'

/** Thư mục worktree mặc định: `<repo>-wt/<nhánh>`, dấu "/" và ký tự cấm trong tên nhánh đổi thành "-". Khớp với server (git-actions.js). */
export const worktreeDir = (repoPath: string, branch: string) => {
  const sep = repoPath.includes('\\') ? '\\' : '/'
  return repoPath.replace(/[\\/]+$/, '') + '-wt' + sep + branch.trim().replace(/[\\/:*?"<>|]+/g, '-')
}

export const changeCount = (r: RepoSummary) => r.staged + r.modified + r.untracked + r.conflicts
export const isDirty = (r: RepoSummary) => changeCount(r) > 0
export const isOut = (r: RepoSummary) => r.ahead > 0 || r.behind > 0

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Thư mục gốc (trong danh sách đã cấu hình) chứa repo; chọn gốc sâu nhất khi lồng nhau. */
export function rootOf(repoPath: string, roots: string[]): string | undefined {
  const p = norm(repoPath)
  return [...roots].sort((a, b) => b.length - a.length).find((r) => p.startsWith(norm(r) + '/'))
}

export const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p

/** Rút gọn đường dẫn dài: giữ phần cuối. */
export const shortPath = (p: string) => (p.length > 34 ? '…' + p.slice(-33) : p)

export type RepoTone = 'danger' | 'dirty' | 'ok'
export const toneOf = (r: RepoSummary): RepoTone => (r.conflicts > 0 || r.error ? 'danger' : isDirty(r) ? 'dirty' : 'ok')
export const toneColor = (t: RepoTone) => (t === 'danger' ? 'var(--danger)' : t === 'dirty' ? 'var(--behind)' : 'var(--accent)')
