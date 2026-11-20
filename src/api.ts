import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitConfig, RepoDetail, ReposResponse, UsageRow } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  return body as T
}

export const api = {
  usage: () => request<UsageRow[]>('/api/usage'),
  repos: (rescan = false) => request<ReposResponse>('/api/git/repos' + (rescan ? '?rescan=1' : '')),
  repo: (path: string) => request<RepoDetail>('/api/git/repo?path=' + encodeURIComponent(path)),
  config: () => request<GitConfig>('/api/git/config'),
  saveConfig: (c: GitConfig) =>
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

  const run = useCallback((silent: boolean) => {
    const id = ++seq.current
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    fnRef.current().then(
      (data) => { if (id === seq.current) setState({ data, error: null, loading: false }) },
      (e: Error) => { if (id === seq.current) setState((s) => ({ ...s, error: e.message, loading: false })) },
    )
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
