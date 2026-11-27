import type { ChangeRequest } from '../types'

export type WaitLevel = 'ok' | 'warn' | 'late'
export const WAIT_WARN_H = 4
export const WAIT_LATE_H = 24

/** Mốc bắt đầu chờ: lúc được yêu cầu review nếu biết, không thì lúc MR / PR được tạo. */
export function waitSince(c: Pick<ChangeRequest, 'reviewRequestedAt' | 'createdAt'>): { at: string; exact: boolean } {
  return c.reviewRequestedAt ? { at: c.reviewRequestedAt, exact: true } : { at: c.createdAt, exact: false }
}

/** Số giờ chờ (không âm). Ngày giờ hỏng → 0. */
export function waitHours(c: Pick<ChangeRequest, 'reviewRequestedAt' | 'createdAt'>, now = Date.now()): number {
  const t = Date.parse(waitSince(c).at)
  return Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : 0
}

export function waitLevel(hours: number, warn = WAIT_WARN_H, late = WAIT_LATE_H): WaitLevel {
  return hours >= late ? 'late' : hours >= warn ? 'warn' : 'ok'
}

/** Tổng dòng đổi; null khi remote không trả số dòng. */
export function sizeLines(c: Pick<ChangeRequest, 'size'>): number | null {
  const s = c.size
  return s && s.additions !== null && s.deletions !== null ? s.additions + s.deletions : null
}

/** Hàng đợi: chỉ MR / PR đang mở người khác gửi mà tôi được yêu cầu review, chờ lâu nhất trước (draft xuống cuối). */
export function reviewQueue(list: ChangeRequest[], now = Date.now()): ChangeRequest[] {
  return list
    .filter((c) => c.state === 'opened' && c.reviewMe && !c.mine)
    .sort((a, b) => Number(a.draft) - Number(b.draft) || waitHours(b, now) - waitHours(a, now) || a.key.localeCompare(b.key))
}

/** Trạng thái riêng của tôi với một MR / PR trong hàng đợi. */
export type ReviewState = 'new' | 'reviewing' | 'waiting' | 'again'
export const REVIEW_STATE_LABEL: Record<ReviewState, string> = { new: 'Chưa xem', reviewing: 'Đang xem', waiting: 'Chờ tác giả sửa', again: 'Cần xem lại' }

/**
 * Đã có review của tôi: commit mới hơn lần review → "cần xem lại", không thì "chờ tác giả sửa" (thiếu mốc commit coi như chờ).
 * Chưa review: "đang xem" nếu tôi đã đánh dấu, không thì "chưa xem".
 */
export function reviewState(c: Pick<ChangeRequest, 'myReviewAt' | 'lastCommitAt'>, marked: boolean): ReviewState {
  const r = c.myReviewAt ? Date.parse(c.myReviewAt) : NaN
  if (Number.isFinite(r)) {
    const k = c.lastCommitAt ? Date.parse(c.lastCommitAt) : NaN
    return Number.isFinite(k) && k > r ? 'again' : 'waiting'
  }
  return marked ? 'reviewing' : 'new'
}
