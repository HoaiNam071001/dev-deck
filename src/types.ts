export type Provider = 'claude' | 'codex' | 'gemini' | 'antigravity'

export interface UsageRow {
  provider: Provider
  t: string
  project: string
  /** Đường dẫn đầy đủ của dự án (nếu log có ghi) */
  projectPath?: string
  /** Chỉ có với Claude: thư mục cấu hình của tài khoản ('' = mặc định) */
  account?: string
  /** Nhánh git lúc ghi dòng này (Claude, Codex); trống nếu log không có hoặc detached */
  branch?: string
  /** Mã phiên làm việc */
  session?: string
  /** Thư mục làm việc của dòng này, chỉ có khi khác projectPath (vd worktree, thư mục con) */
  cwd?: string
  model: string
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export interface UsageSource { id: Provider; label: string; root: string; found: boolean; files: number; rows: number }

/** Một tài khoản Claude Code = một thư mục cấu hình. dir '' là tài khoản mặc định. */
export interface ClaudeProfile { dir: string; path: string; email: string | null; org: string | null }
/** Thông báo "AI chạy xong" (giai đoạn 14). Quy tắc theo thư mục: khớp tiền tố, dài nhất thắng. */
export interface AiNotifyConfig {
  enabled: boolean
  minSeconds: number
  debounceSeconds: number
  sources: Record<string, boolean>
  rules: { path: string; enabled: boolean }[]
}
export interface AiNotifyState {
  config: AiNotifyConfig
  projects: { path: string; name: string; providers: string[]; last: string }[]
  hooks: { dir: string; path: string; installed: boolean; stale: boolean; error: string }[]
}
export interface AiDoneEvent { id: number; source: string; session: string; project: string; projectPath: string; finishedAt: string; durationSec: number | null }

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
  /** Số worktree phụ đã gom vào repo này. */
  worktrees?: number
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

export interface StashInfo { ref: string; message: string; at: string; branch: string | null }
/** Một mục của `git worktree list`; mục đầu (main) là worktree chính. dirty = số tệp thay đổi, null nếu không đọc được. */
export interface WorktreeInfo { path: string; branch: string | null; head: string; detached: boolean; bare: boolean; locked: boolean; prunable: boolean; main: boolean; dirty: number | null }
export interface StashFile { path: string; add: number; del: number }
export type DiffKind = 'staged' | 'unstaged' | 'untracked' | 'stash'
export interface DiffHunk { header: string; lines: string[]; hash: string }
export interface FileDiff { file: string; kind: DiffKind; binary: boolean; tooLarge: boolean; size: number; hunks: DiffHunk[]; nonUtf8?: boolean }

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
  stashes: StashInfo[]
  worktrees: WorktreeInfo[]
  numstat?: NumStat
}

/** Kết quả POST /api/git/action. dryRun=true thì chưa làm gì, info mô tả điều sẽ xảy ra. */
export interface ActionResult { ok: true; output: string; dryRun?: boolean; info?: Record<string, unknown> }
export interface DeleteBranchInfo { branch: string; merged: boolean; unmerged: number; upstream: string | null }
export interface DeleteRepoInfo { name: string; path: string; dirty: number; unpushed: string[]; stashes: number; hasRemote: boolean; nested: number }
export interface CloneJob { id: string; url: string; path: string; name: string; status: 'running' | 'done' | 'error' | 'cancelled'; percent: number; phase: string; error: string | null }

export interface GitConfig { roots: string[]; depth: number; recent: string[] }
export interface BrowseResult { path: string; parent: string | null; home: string; isRepo?: boolean; dirs: { name: string; path: string; isRepo: boolean }[] }

export interface NumStat { staged: Record<string, [number, number]>; unstaged: Record<string, [number, number]> }

export interface ActivityItem { at: string; repo: string; action: string; ok: boolean; error?: string; detail: string }
export interface ScanSummary { at: string; ms: number; repos: number; roots: string[]; byRoot: Record<string, number> }
/** cpu: % CPU giữa hai lần quét (null = chưa đo được); done: tiến trình đã kết thúc khi job vẫn chạy. */
export interface JobPort { port: number; host: string }
export interface JobProc { pid: number; ppid: number; depth: number; name: string; cmd: string; mem: number; cpu: number | null; ports: JobPort[]; start: string; done: boolean; endedAt: number | null }
/** test = chạy test · dev = dev server · build = biên dịch/đóng gói · other. */
export type JobKind = 'test' | 'dev' | 'build' | 'other'
/** Tiến độ test do reporter trong vitest ghi ra (null nếu project chưa bật reporter). */
export interface JobProgress {
  runner: string; finished: boolean; updatedAt: number
  total: number; done: number; pass: number; fail: number; skip: number; running: number
  files: { file: string; state: 'queued' | 'running' | 'pass' | 'fail' | 'skip'; ms?: number }[]
}
export interface Job {
  /** Có giá trị khi job do DevDeck khởi chạy (tab Script). */
  runId?: string
  kind: JobKind
  /** Cổng TCP đang lắng nghe của job và các tiến trình con (pid = tiến trình giữ cổng). */
  ports: (JobPort & { pid: number })[]
  progress: JobProgress | null
  cpu: number | null
  stats: { running: number; idle: number; done: number }
  ppid: number
  parent: string
  procs: JobProc[]
  pid: number
  name: string
  cmd: string
  cwd: string
  repo: string
  /** Nhánh hiện tại của repo (null nếu không phải repo git; "@abc1234" nếu detached). */
  branch: string | null
  start: string
  mem: number
  children: number
}
export interface JobsResponse { supported: boolean; at: string; folders: string[]; jobs: Job[] }
/** Trạng thái cài reporter tiến độ dùng chung. state: none = chưa cài · ok = bản mới nhất · outdated = bản cũ · missing = thư mục không còn. */
export interface ReporterStatus {
  supported: boolean
  folders: { path: string; state: 'none' | 'ok' | 'outdated' | 'missing'; tracked: boolean }[]
  nodeOptions: string; enabled: boolean; preloadReady: boolean; preload: string; error?: string
}
/** custom = false: đang dùng chung thư mục quét của trang Git. */
export interface JobsConfig { folders: string[]; custom: boolean; recent: string[] }

export interface Overview { config: GitConfig; scan: ScanSummary | null; activity: ActivityItem[] }

// ---- Remotes (GitLab / GitHub): MR / PR ----
export type RemoteProvider = 'gitlab' | 'github'
export interface RemoteAccount { id: string; provider: RemoteProvider; name: string; baseUrl: string; user: string; tokenHint: string; write: boolean }
export type CiState = 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'none'
export interface RemotePerson { name: string; username: string }
export interface ChangeRequest {
  key: string
  accountId: string
  provider: RemoteProvider
  number: number
  title: string
  url: string
  project: string
  source: string
  target: string
  author: RemotePerson
  draft: boolean
  state: 'opened' | 'merged' | 'closed'
  createdAt: string
  updatedAt: string
  /** null = chưa biết */
  conflict: boolean | null
  ci: CiState
  approvals: { have: number; need: number | null; approved: boolean; changes: boolean } | null
  threads: { resolved: number; total: number } | null
  reviewers: RemotePerson[]
  mine: boolean
  reviewMe: boolean
  /** Reviewer chưa phản hồi và mốc họ được yêu cầu (null = remote không có mốc → dùng createdAt) */
  waitingOn?: { name: string; username: string; since: string | null }[]
  /** Lúc tôi được yêu cầu review (GitHub: ReviewRequestedEvent; GitLab: chưa có mốc chính xác → null, dùng createdAt) */
  reviewRequestedAt?: string | null
  /** Lần review gần nhất của tôi (GitHub; GitLab chưa có → null) và commit mới nhất của MR / PR */
  myReviewAt?: string | null
  lastCommitAt?: string | null
  /** Độ lớn thay đổi; null = remote không trả */
  size?: { additions: number | null; deletions: number | null; files: number | null } | null
}
export interface ReviewComment { author: RemotePerson; body: string; createdAt: string; url: string | null }
export interface ReviewThread { id: string; resolved: boolean; outdated: boolean; path: string | null; line: number | null; comments: ReviewComment[] }
export interface ChangeRequestDetail extends ChangeRequest {
  description: string
  threadList: ReviewThread[]
  checks: { name: string; status: CiState | 'none' }[]
  /** Job lỗi kèm đoạn cuối log (chỉ GitLab) */
  failedJobs?: { id: string; name: string; stage: string; url: string | null; reason: string; log: string | null }[]
  approvedBy: string[]
  mergeStatus: string
  pipelineUrl: string | null
}
export interface CrListResponse { items: ChangeRequest[]; projects?: { accountId: string; provider: 'gitlab' | 'github'; project: string }[]; errors: { accountId: string; name: string; error: string }[]; fetchedAt: string }
export interface RemoteBranch {
  name: string
  isDefault: boolean
  protected: boolean
  /** Đã merge vào nhánh mặc định (chỉ GitLab; null = không biết) */
  merged: boolean | null
  commit: { sha: string; title: string; author: string; date: string; url: string | null } | null
}
export interface RemoteBranchesResponse {
  defaultBranch: string | null
  url: string | null
  branches: RemoteBranch[]
  crs: ChangeRequest[]
  crsError: boolean
  local: { path: string; name: string; branches: string[] } | null
}
export type CrScope = 'mine' | 'review' | 'assigned' | 'all'
export type CrState = 'opened' | 'merged' | 'closed'
export interface PipelineRun {
  id: string
  /** Tiêu đề run (GitHub); GitLab để trống */
  title: string
  status: CiState
  ref: string
  sha: string
  source: string
  url: string | null
  createdAt: string
  durationSec: number | null
}
export interface PipelineJob {
  id: string
  name: string
  stage: string
  status: CiState
  durationSec: number | null
  url: string | null
  allowFailure: boolean
  reason: string
  /** Đoạn cuối log của job lỗi (chỉ GitLab) */
  log: string | null
}
/** Job chạy ở máy này (tab Job) trên bản clone local của project, đúng nhánh nguồn của MR / PR. */
export interface RemoteLocalJobs {
  local: { path: string; name: string } | null
  jobs: { pid: number; name: string; kind: JobKind; cmd: string; start: string; progress: { total: number; done: number; pass: number; fail: number; finished: boolean } | null }[]
}

export interface BulkPullPlan { path: string; eligible: boolean; reason?: string | null; behind?: number; branch?: string; upToDate?: boolean }
export interface BulkPullResult { path: string; status: 'ok' | 'skipped' | 'error'; message: string }
export interface BulkCleanupPlan { path: string; base: string | null; branches: string[]; reason?: string }
export interface BulkCleanupResult { path: string; done: string[]; failed: { branch: string; message: string }[] }

// Chạy script npm (giai đoạn 12)
export interface ScriptPackage { rel: string; name: string; manager: 'npm' | 'pnpm' | 'yarn'; scripts: Record<string, string> }
export interface ScriptPackages { root: string; packages: ScriptPackage[] }
export interface ScriptRun { id: string; repo: string; rel: string; script: string; args: string[]; manager: string; pid: number; start: string; end: string | null; code: number | null; port: number; running: boolean; seq: number }
export interface ScriptLog { run: ScriptRun; from: number; lines: string[] }

export interface JiraAccount { id: string; name: string; baseUrl: string; kind: 'cloud' | 'server'; email: string; user: string; tokenHint: string; write: boolean }
export interface JiraIssue {
  key: string; summary: string; status: string; category: 'todo' | 'doing' | 'done'
  assignee: string; priority: string; type: string; sprint: string; description: string; url: string; accountId: string
}
export interface JiraMine { items: JiraIssue[]; errors: { accountId: string; name: string; error: string }[] }
export interface JiraEvent { kind: 'status' | 'assignee' | 'priority' | 'sprint' | 'comment'; text: string }
export interface JiraNewItem { issue: JiraIssue; pinned: boolean; events: JiraEvent[] }
export interface JiraNew { items: JiraNewItem[]; errors: { accountId: string; name: string; error: string }[] }
export interface JiraRepoLink { path: string; name: string; branches: string[]; suggested: boolean }
