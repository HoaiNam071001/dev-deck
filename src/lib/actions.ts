import { api } from '../api'
import { systemNotify } from './platform'
import { bump, toast } from './store'

const TITLES: Record<string, [ok: string, fail: string]> = {
  fetch: ['Đã fetch', 'Fetch thất bại'],
  pull: ['Đã pull', 'Pull thất bại'],
  push: ['Đã push', 'Push thất bại'],
  commit: ['Đã commit', 'Commit thất bại'],
  createBranch: ['Đã tạo nhánh', 'Tạo nhánh thất bại'],
  checkout: ['Đã chuyển nhánh', 'Chuyển nhánh thất bại'],
  pullBranch: ['Đã pull nhánh', 'Pull nhánh thất bại'],
  pushBranch: ['Đã push nhánh', 'Push nhánh thất bại'],
  stage: ['Đã stage', 'Stage thất bại'],
  unstage: ['Đã bỏ stage', 'Bỏ stage thất bại'],
  stageHunk: ['Đã stage hunk', 'Stage hunk thất bại'],
  unstageHunk: ['Đã bỏ stage hunk', 'Bỏ stage hunk thất bại'],
  stash: ['Đã stash', 'Stash thất bại'],
  stashApply: ['Đã áp dụng stash', 'Áp dụng stash thất bại'],
  stashPop: ['Đã lấy lại stash', 'Lấy lại stash thất bại'],
  stashDrop: ['Đã xóa stash', 'Xóa stash thất bại'],
  worktreeAdd: ['Đã tạo worktree', 'Tạo worktree thất bại'],
  worktreeRemove: ['Đã xóa worktree', 'Xóa worktree thất bại'],
  worktreePrune: ['Đã dọn worktree hỏng', 'Dọn worktree thất bại'],
  renameBranch: ['Đã đổi tên nhánh', 'Đổi tên nhánh thất bại'],
  deleteBranch: ['Đã xóa nhánh', 'Xóa nhánh thất bại'],
  deleteRemoteBranch: ['Đã xóa nhánh trên remote', 'Xóa nhánh remote thất bại'],
}
const lastLine = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? ''

/** Chạy một hành động ghi, hiện toast kết quả, báo cho danh sách/khung chi tiết tải lại. Trả về true nếu thành công. */
export async function runAction(repoPath: string, repoName: string, action: string, params: Record<string, unknown> = {}, quiet = false): Promise<boolean> {
  const [okT, failT] = TITLES[action] ?? ['Xong', 'Thất bại']
  try {
    const r = await api.action(repoPath, action, params)
    if (!quiet) toast({ kind: 'ok', title: `${okT} ${repoName}`, detail: lastLine(r.output) })
    return true
  } catch (e) {
    toast({ kind: 'err', title: `${failT} · ${repoName}`, detail: (e as Error).message })
    if (action === 'push' || action === 'pull' || action === 'pushBranch' || action === 'pullBranch') systemNotify(`${failT} · ${repoName}`, (e as Error).message)
    return false
  } finally {
    bump()
  }
}
