import { useSyncExternalStore } from 'react'
import type { RepoSummary } from '../types'
import { isDirty, isOut } from './repo'

/** `onOpen`: bấm vào thông báo thì làm việc này (vd mở MR / PR liên quan) rồi đóng toast. */
export interface Toast { id: number; kind: 'ok' | 'err'; title: string; detail?: string; onOpen?: () => void }

interface State {
  repos: RepoSummary[]
  scannedAt: string | null
  scanMs: number | null
  scanning: boolean
  /** Số repo cần chú ý (có thay đổi hoặc lệch remote), hiện ở thanh bên */
  attention: number
  /** Số thread review mới trên MR / PR từ lần mở tab Remotes gần nhất, hiện ở thanh bên */
  remoteUnread: number
  /** MR / PR đang chờ tôi review (không tính draft) và số đã quá ngưỡng đỏ */
  reviewQueue: { waiting: number; late: number }
  selected: string | null
  /** Tăng sau mỗi thao tác ghi để danh sách và khung chi tiết tải lại */
  rev: number
  palette: boolean
  toasts: Toast[]
  pinned: string[]
  /** Lệnh chờ trang Git xử lý khi mở (từ bảng lệnh / phím tắt ở trang khác) */
  pending: 'rescan' | 'fetchAll' | 'pullAll' | 'cleanup' | null
  wantTab: string | null // palette xin mở một tab của chi tiết repo
  /** Khóa MR / PR cần mở chi tiết khi vào trang Remotes (từ thông báo); trang Remotes nhận rồi xóa */
  openRemote: string | null
}

const loadPinned = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem('git.pinned') || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}

let state: State = { repos: [], scannedAt: null, scanMs: null, scanning: false, attention: 0, remoteUnread: 0, reviewQueue: { waiting: 0, late: 0 }, selected: null, rev: 0, palette: false, toasts: [], pinned: loadPinned(), pending: null, wantTab: null, openRemote: null }
const subs = new Set<() => void>()

export const getState = () => state
export function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => sel(state))
}

export function setRepos(repos: RepoSummary[], scannedAt: string | null, scanMs: number | null) {
  setState({ repos, scannedAt, scanMs, attention: repos.filter((r) => isDirty(r) || isOut(r)).length })
}
export const bump = () => setState({ rev: state.rev + 1 })

export function setPinned(next: string[]) {
  try { localStorage.setItem('git.pinned', JSON.stringify(next)) } catch { /* bỏ qua */ }
  setState({ pinned: next })
}
/** Ghim (hoặc đưa lên đầu nếu đã ghim). */
export const pinRepo = (p: string) => setPinned([p, ...state.pinned.filter((x) => x !== p)])
export const unpinRepo = (p: string) => setPinned(state.pinned.filter((x) => x !== p))

let tid = 0
export function toast(t: Omit<Toast, 'id'>) {
  const id = ++tid
  setState({ toasts: [...state.toasts.slice(-3), { ...t, id }] })
  setTimeout(() => dismissToast(id), t.kind === 'err' ? 8000 : 4000)
}
export const dismissToast = (id: number) => setState({ toasts: state.toasts.filter((t) => t.id !== id) })
export const openPalette = (open = true) => setState({ palette: open })
