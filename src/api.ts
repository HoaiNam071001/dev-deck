import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeRequest, ChangeRequestDetail, RemoteBranchesResponse, PipelineRun, PipelineJob, CrListResponse, CrScope, CrState, RemoteAccount, ClaudeAccount, JobsConfig, JobsResponse, ReporterStatus, ClaudeProfile, BrowseResult, GitConfig, Overview, RepoDetail, ReposResponse, UsageRow, UsageSource } from './types'

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
  usageSources: () => request<UsageSource[]>('/api/usage/sources'),
  repos: (rescan = false) => request<ReposResponse>('/api/git/repos' + (rescan ? '?rescan=1' : '')),
  repo: (path: string) => request<RepoDetail>('/api/git/repo?path=' + encodeURIComponent(path)),
  action: (path: string, action: string, params: Record<string, unknown> = {}) =>
    request<{ ok: true; output: string }>('/api/git/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...params, action, path }) }),
  jobs: () => request<JobsResponse>('/api/jobs'),
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
  reload: () => void
}

/** Gọi `fn` khi mount / khi `deps` đổi; `reload()` gọi lại; `every` (ms) tự làm mới. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], every = 0): Loadable<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const inflight = useRef(false)

  const run = useCallback((silent: boolean) => {
    // Poll nền: nếu lượt trước chưa xong thì bỏ qua, kẻo kết quả chậm luôn bị coi là cũ và không bao giờ hiện
    if (silent && inflight.current) return
    const id = ++seq.current
    inflight.current = true
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    fnRef.current().then(
      (data) => { if (id === seq.current) setState({ data, error: null, loading: false }) },
      (e: Error) => { if (id === seq.current) setState((s) => ({ ...s, error: e.message, loading: false })) },
    ).finally(() => { if (id === seq.current) inflight.current = false })
  }, [])

  useEffect(() => {
    run(false)
    if (!every) return
    const t = setInterval(() => run(true), every)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [every, run, ...deps])

  return { ...state, reload: () => run(false) }
}
