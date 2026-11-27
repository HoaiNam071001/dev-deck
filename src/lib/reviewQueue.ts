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

/** Mốc chờ của một reviewer (phía tác giả): lúc họ được yêu cầu, không thì lúc tạo MR / PR. */
export function reviewerWait(w: { since: string | null }, c: Pick<ChangeRequest, 'createdAt'>, now = Date.now()): { hours: number; exact: boolean } {
  const t = Date.parse(w.since || c.createdAt)
  return { hours: Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : 0, exact: !!w.since }
}

/** Số giờ MR của tôi đã chờ người chờ lâu nhất; 0 khi không còn ai. */
export function authorWaitHours(c: Pick<ChangeRequest, 'waitingOn' | 'createdAt'>, now = Date.now()): number {
  return Math.max(0, ...(c.waitingOn ?? []).map((w) => reviewerWait(w, c, now).hours))
}

/** Phía tác giả: MR / PR mở của tôi còn reviewer chưa phản hồi, chờ lâu nhất trước (draft cuối). */
export function authorQueue(list: ChangeRequest[], now = Date.now()): ChangeRequest[] {
  return list
    .filter((c) => c.state === 'opened' && c.mine && (c.waitingOn?.length ?? 0) > 0)
    .sort((a, b) => Number(a.draft) - Number(b.draft) || authorWaitHours(b, now) - authorWaitHours(a, now) || a.key.localeCompare(b.key))
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

const RANK: Record<WaitLevel, number> = { ok: 0, warn: 1, late: 2 }
export type WaitSeen = Record<string, WaitLevel>
export interface WaitAlert { key: string; level: WaitLevel; title: string; body: string }

/**
 * Báo một lần khi MR / PR trong hàng đợi vượt ngưỡng vàng / đỏ. `prev` = mức đã ghi nhận lần trước.
 * Lần đầu (prev null) chỉ ghi mốc, không báo; draft không báo. MR rời hàng đợi thì bỏ khỏi mốc.
 */
export function waitAlerts(prev: WaitSeen | null, queue: ChangeRequest[], now = Date.now()): { next: WaitSeen; alerts: WaitAlert[] } {
  const next: WaitSeen = {}
  const alerts: WaitAlert[] = []
  for (const c of queue) {
    const level = waitLevel(waitHours(c, now))
    // Giữ mức cao nhất đã báo để giờ chờ dao động không báo lặp
    const old = prev?.[c.key] ?? 'ok'
    next[c.key] = RANK[old] > RANK[level] ? old : level
    if (!prev || c.draft || RANK[level] <= RANK[old] || level === 'ok') continue
    const ref = `${c.project} ${c.provider === 'gitlab' ? '!' : '#'}${c.number}`
    alerts.push({ key: c.key, level, title: level === 'late' ? 'Review trễ hạn' : 'MR chờ review lâu', body: `${ref} · ${c.title} · chờ ${Math.floor(waitHours(c, now))} giờ` })
  }
  return { next, alerts }
}

/** Số MR / PR đang chờ tôi (không tính draft) và số đã quá ngưỡng đỏ. */
export function queueCounts(queue: ChangeRequest[], now = Date.now()): { waiting: number; late: number } {
  const live = queue.filter((c) => !c.draft)
  return { waiting: live.length, late: live.filter((c) => waitLevel(waitHours(c, now)) === 'late').length }
}
