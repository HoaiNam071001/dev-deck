import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScriptPackages, ScriptRun, ScriptLog, ActionResult, CloneJob, DeleteRepoInfo, ChangeRequest, ChangeRequestDetail, RemoteBranchesResponse, RemoteLocalJobs, PipelineRun, PipelineJob, CrListResponse, CrScope, CrState, RemoteAccount, ClaudeAccount, JobsConfig, JobsResponse, ReporterStatus, ClaudeProfile, BrowseResult, DiffKind, FileDiff, StashFile, GitConfig, Overview, RepoDetail, ReposResponse, UsageRow, UsageSource, AiNotifyConfig, AiNotifyState, AiDoneEvent, JiraAccount, JiraIssue, JiraMine, JiraNew, JiraRepoLink } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  return body as T
}

export const api = {
  usage: () => request<UsageRow[]>('/api/usage'),
  claudeAccount: (dir = '') => request<ClaudeAccount>('/api/account/claude?dir=' + encodeURIComponent(dir)),
  claudeAccounts: () => request<ClaudeProfile[]>('/api/accounts/claude'),
  claudeAccountAction: (action: 'add' | 'remove', dir: string) =>
    request<ClaudeProfile[]>('/api/accounts/claude', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, dir }) }),
  aiDone: (since: number) => request<{ events: AiDoneEvent[]; last: number }>('/api/ai/done?since=' + since),
  aiNotify: () => request<AiNotifyState>('/api/ai/notify'),
  aiNotifySave: (config: AiNotifyConfig) =>
    request<AiNotifyState>('/api/ai/notify', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) }),
  aiHook: (action: 'install' | 'uninstall', dir?: string) =>
    request<AiNotifyState>('/api/ai/hook/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dir === undefined ? { action } : { action, dir }) }),
  usageSources: () => request<UsageSource[]>('/api/usage/sources'),
  repos: (rescan = false) => request<ReposResponse>('/api/git/repos' + (rescan ? '?rescan=1' : '')),
  repo: (path: string) => request<RepoDetail>('/api/git/repo?path=' + encodeURIComponent(path)),
  diff: (path: string, file: string, kind: DiffKind, ref = '') =>
    request<FileDiff>(`/api/git/diff?path=${encodeURIComponent(path)}&file=${encodeURIComponent(file)}&kind=${kind}&ref=${encodeURIComponent(ref)}`),
  stashFiles: (path: string, ref: string) => request<StashFile[]>(`/api/git/stash?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`),
  action: (path: string, action: string, params: Record<string, unknown> = {}) =>
    request<ActionResult>('/api/git/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...params, action, path }) }),
  createRepo: (p: { parent: string; name: string; readme: boolean; gitignore: boolean }) =>
    request<{ ok: true; path: string }>('/api/git/repo-action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, action: 'create' }) }),
  deleteRepo: (p: { path: string; dryRun?: boolean; confirmName?: string }) =>
    request<{ ok: true; dryRun?: boolean; info?: DeleteRepoInfo }>('/api/git/repo-action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, action: 'delete' }) }),
  bulk: <T,>(body: Record<string, unknown>) =>
    request<T>('/api/git/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  cloneStart: (p: { url: string; parent: string; name: string }) =>
    request<CloneJob>('/api/git/clone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }),
  cloneStatus: (id: string) => request<CloneJob>('/api/git/clone?id=' + encodeURIComponent(id)),
  cloneCancel: (id: string) =>
    request<CloneJob>('/api/git/clone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id }) }),
  jobs: () => request<JobsResponse>('/api/jobs'),
  scripts: (path: string) => request<ScriptPackages>('/api/jobs/scripts?' + new URLSearchParams({ path })),
  scriptRuns: () => request<ScriptRun[]>('/api/jobs/runs'),
  scriptLog: (id: string, since: number) => request<ScriptLog>('/api/jobs/log?' + new URLSearchParams({ id, since: String(since) })),
  runScript: (path: string, dir: string, script: string, args: string) =>
    request<ScriptRun>('/api/jobs/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, dir, script, args }) }),
  stopScript: (id: string) =>
    request<ScriptRun>('/api/jobs/run-stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }),
  reporterStatus: () => request<ReporterStatus>('/api/jobs/reporter'),
  reporterSetup: (body: { action: 'install' | 'uninstall'; folders: string[] } | { action: 'enable' | 'disable' }) =>
    request<ReporterStatus>('/api/jobs/reporter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  installReporter: (repo: string) =>
    request<{ ok: true; path: string; rel: string }>('/api/jobs/install-reporter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repo }) }),
  jobsConfig: () => request<JobsConfig>('/api/jobs/config'),
  saveJobsConfig: (folders: string[]) =>
    request<JobsConfig>('/api/jobs/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folders }) }),
  stopJob: (pid: number, start: string) =>
    request<{ ok: true }>('/api/jobs/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid, start }) }),
  remoteAccounts: () => request<RemoteAccount[]>('/api/remotes/accounts'),
  addRemoteAccount: (a: { provider: string; name: string; baseUrl: string; token: string }) =>
    request<RemoteAccount>('/api/remotes/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', ...a }) }),
  removeRemoteAccount: (id: string) =>
    request<RemoteAccount[]>('/api/remotes/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) }),
  testRemoteAccount: (id: string) =>
    request<{ ok: true; user: string }>('/api/remotes/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'test', id }) }),
  changeRequests: (account: string, scope: CrScope, state: CrState) =>
    request<CrListResponse>(`/api/remotes/crs?account=${encodeURIComponent(account)}&scope=${scope}&state=${state}`),
  branchChangeRequests: (remotes: string[], branch: string) =>
    request<ChangeRequest[]>('/api/remotes/for-branch?' + new URLSearchParams([...remotes.map((r) => ['remote', r]), ['branch', branch]])),
  remoteBranches: (account: string, project: string) =>
    request<RemoteBranchesResponse>('/api/remotes/branches?' + new URLSearchParams({ account, project })),
  pipelines: (account: string, project: string) =>
    request<PipelineRun[]>('/api/remotes/pipelines?' + new URLSearchParams({ account, project })),
  pipelineJobs: (account: string, project: string, id: string) =>
    request<PipelineJob[]>('/api/remotes/pipeline-jobs?' + new URLSearchParams({ account, project, id })),
  remoteLocalJobs: (account: string, project: string, branch: string) =>
    request<RemoteLocalJobs>('/api/remotes/local-jobs?' + new URLSearchParams({ account, project, branch })),
  setRemoteWrite: (id: string, on: boolean) =>
    request<RemoteAccount>('/api/remotes/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'setWrite', id, on }) }),
  remoteAct: (body: { action: 'resolve' | 'unresolve' | 'reply' | 'retry' | 'approve' | 'unapprove' | 'merge' | 'create'; key?: string; threadId?: string; body?: string; account?: string; project?: string; id?: string; source?: string; target?: string; title?: string; description?: string }) =>
    request<{ ok: true; url: string | null; number: number | null }>('/api/remotes/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  jiraAccounts: () => request<JiraAccount[]>('/api/jira/accounts'),
  addJiraAccount: (a: { name?: string; baseUrl: string; kind?: 'cloud' | 'server'; email?: string; token: string }) =>
    request<JiraAccount>('/api/jira/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', ...a }) }),
  removeJiraAccount: (id: string) =>
    request<JiraAccount[]>('/api/jira/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) }),
  testJiraAccount: (id: string) =>
    request<{ ok: true; user: string }>('/api/jira/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'test', id }) }),
  jiraIssues: (keys: string[]) => request<JiraIssue[]>('/api/jira/issues?' + new URLSearchParams(keys.map((k) => ['key', k]))),
  jiraLinks: (key: string) => request<JiraRepoLink[]>('/api/jira/links?key=' + encodeURIComponent(key)),
  jiraNew: () => request<JiraNew>('/api/jira/new'),
  jiraPin: (key: string, on: boolean) =>
    request<{ pinned: string[] }>('/api/jira/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, on }) }),
  jiraSeen: (key?: string) =>
    request<{ ok: true }>('/api/jira/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }),
  jiraMine: () => request<JiraMine>('/api/jira/mine'),
  jiraExtract: (texts: string[]) =>
    request<string[][]>('/api/jira/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts }) }),
  changeRequest: (key: string) => request<ChangeRequestDetail>('/api/remotes/cr?key=' + encodeURIComponent(key)),
  config: () => request<GitConfig>('/api/git/config'),
  overview: () => request<Overview>('/api/overview'),
  browse: (path: string) => request<BrowseResult>('/api/git/browse?path=' + encodeURIComponent(path)),
  saveConfig: (c: Pick<GitConfig, 'roots' | 'depth'>) =>
    request<GitConfig>('/api/git/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }),
}

export interface Loadable<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** Lúc tải xong lần gần nhất (ms epoch), null nếu chưa có */
  at: number | null
  /** Thời gian tải lần gần nhất (ms) */
  ms: number | null
  reload: () => void
}

interface Entry { data: unknown; at: number; ms: number }
/** Cache theo khóa, dùng chung giữa các trang: quay lại trang là có dữ liệu ngay, rồi làm mới ngầm nếu đã cũ. */
const memo = new Map<string, Entry>()
const LS = 'cache.v1:'
const LS_MAX = 600_000 // ký tự; entry lớn hơn chỉ giữ trong RAM

function readCache(key: string): Entry | null {
  const hit = memo.get(key)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(LS + key)
    if (raw) { const e = JSON.parse(raw) as Entry; memo.set(key, e); return e }
  } catch { /* bỏ qua */ }
  return null
}
function writeCache(key: string, e: Entry) {
  memo.set(key, e)
  try {
    const raw = JSON.stringify(e)
    if (raw.length <= LS_MAX) localStorage.setItem(LS + key, raw)
    else localStorage.removeItem(LS + key)
  } catch { /* hết dung lượng: bỏ qua */ }
}
/** Xóa cache theo tiền tố khóa (vd. sau khi đổi cấu hình). */
export function dropCache(prefix: string) {
  for (const k of [...memo.keys()]) if (k.startsWith(prefix)) memo.delete(k)
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(LS + prefix)) localStorage.removeItem(k) } } catch { /* bỏ qua */ }
}

const DEFAULT_TTL = 5 * 60000

/**
 * Gọi `fn` khi mount / khi `deps` đổi; `reload()` gọi lại; `every` (ms) tự làm mới ngầm.
 * Có `key`: kết quả được cache (RAM + localStorage). Mount lại với cache còn mới thì không gọi lại;
 * cache cũ hơn `every` (hoặc 5 phút nếu không tự làm mới) thì hiện ngay dữ liệu cũ và làm mới ngầm.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], every = 0, key?: string): Loadable<T> {
  const init = (): { data: T | null; error: string | null; loading: boolean; at: number | null; ms: number | null } => {
    const c = key ? readCache(key) : null
    return c ? { data: c.data as T, error: null, loading: false, at: c.at, ms: c.ms } : { data: null, error: null, loading: true, at: null, ms: null }
  }
  const [state, setState] = useState(init)
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const keyRef = useRef(key)
  keyRef.current = key

  const inflight = useRef(false)

  const run = useCallback((silent: boolean) => {
    // Poll nền: nếu lượt trước chưa xong thì bỏ qua, kẻo kết quả chậm luôn bị coi là cũ và không bao giờ hiện
    if (silent && inflight.current) return
    const id = ++seq.current
    const k = keyRef.current
    const t0 = performance.now()
    inflight.current = true
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    fnRef.current().then(
      (data) => {
        const at = Date.now(), ms = Math.round(performance.now() - t0)
        if (k) writeCache(k, { data, at, ms })
        if (id === seq.current) setState({ data, error: null, loading: false, at, ms })
      },
      (e: Error) => { if (id === seq.current) setState((s) => ({ ...s, error: e.message, loading: false })) },
    ).finally(() => { if (id === seq.current) inflight.current = false })
  }, [])

  const prevKey = useRef<string | undefined | null>(null) // null = chưa chạy lần nào
  useEffect(() => {
    // Mount hoặc khóa đổi (vd. chọn project khác): dùng cache nếu còn mới. Chỉ `deps` đổi (vd. sau thao tác ghi) thì luôn tải lại.
    const c = key ? readCache(key) : null
    const entering = prevKey.current === null || prevKey.current !== key
    if (prevKey.current !== null && entering && c) setState({ data: c.data as T, error: null, loading: false, at: c.at, ms: c.ms })
    prevKey.current = key
    const ttl = every || DEFAULT_TTL
    if (!(entering && c && Date.now() - c.at <= ttl)) run(!!c)
    if (!every) return
    const t = setInterval(() => run(true), every)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [every, run, key, ...deps])

  return { ...state, reload: () => run(false) }
}
