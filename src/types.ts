export type Provider = 'claude' | 'codex' | 'gemini' | 'antigravity'

export interface UsageRow {
  provider: Provider
  t: string
  project: string
  /** Đường dẫn đầy đủ của dự án (nếu log có ghi) */
  projectPath?: string
  /** Chỉ có với Claude: thư mục cấu hình của tài khoản ('' = mặc định) */
  account?: string
  model: string
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export interface UsageSource { id: Provider; label: string; root: string; found: boolean; files: number; rows: number }

/** Một tài khoản Claude Code = một thư mục cấu hình. dir '' là tài khoản mặc định. */
export interface ClaudeProfile { dir: string; path: string; email: string | null; org: string | null }
export interface AccountWindow { pct: number; resetsAt: string | null }
export interface ClaudeAccount { error?: string; plan?: string | null; email?: string | null; org?: string | null; five?: AccountWindow | null; week?: AccountWindow | null; fetchedAt?: string }

export interface LastCommit { date: string; subject: string; author: string }

export interface RepoSummary {
  path: string
  name: string
  error?: string
  branch: string | null
  detached: boolean
  head: string
  upstream: string | null
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
  conflicts: number
  branches: string[]
  lastCommit: LastCommit | null
}

export interface ReposResponse {
  roots: string[]
  depth: number
  scannedAt: string
  repos: RepoSummary[]
}

export interface BranchInfo {
  name: string
  remote: boolean
  current: boolean
  upstream: string | null
  ahead: number
  behind: number
  gone: boolean
  date: string
  subject: string
  sha: string
}

export interface FileChange { path: string; x: string; y: string; kind: 'change' | 'untracked' | 'conflict' }

export interface RepoDetail {
  path: string
  name: string
  branch: string | null
  detached: boolean
  head: string
  upstream: string | null
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
  conflicts: number
  files: FileChange[]
  branches: BranchInfo[]
  commits: { hash: string; author: string; date: string; subject: string }[]
  remotes: { name: string; url: string }[]
  stashes: number
  numstat?: NumStat
}

export interface GitConfig { roots: string[]; depth: number; recent: string[] }
export interface BrowseResult { path: string; parent: string | null; home: string; isRepo?: boolean; dirs: { name: string; path: string; isRepo: boolean }[] }

export interface NumStat { staged: Record<string, [number, number]>; unstaged: Record<string, [number, number]> }

export interface ActivityItem { at: string; repo: string; action: string; ok: boolean; error?: string; detail: string }
export interface ScanSummary { at: string; ms: number; repos: number; roots: string[]; byRoot: Record<string, number> }
export interface Overview { config: GitConfig; scan: ScanSummary | null; activity: ActivityItem[] }
