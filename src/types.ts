export interface UsageRow {
  t: string
  project: string
  model: string
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

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
}

export interface GitConfig { roots: string[]; depth: number; recent: string[] }
export interface BrowseResult { path: string; parent: string | null; home: string; isRepo?: boolean; dirs: { name: string; path: string; isRepo: boolean }[] }
