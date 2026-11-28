import { useMemo } from 'react'
import { api, useLoad } from '../api'
import { useStore } from './store'
import { repoBranchTokens, type BranchTokens } from './usage'

/** Token AI theo nhánh của một repo (chỉ Claude / Codex có nhánh). Dùng chung cache với trang AI. */
export function useBranchTokens(repoPath: string | undefined): Map<string, BranchTokens> {
  const rows = useLoad(api.usage, [], 0, 'usage').data
  const repos = useStore((s) => s.repos)
  return useMemo(
    () => (rows && repoPath ? repoBranchTokens(rows, repoPath, repos.map((r) => r.path)) : new Map()),
    [rows, repoPath, repos],
  )
}
