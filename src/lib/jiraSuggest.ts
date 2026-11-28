import type { JiraTransition } from '../types'

export interface Suggestion { transition: JiraTransition; reason: string }

const DONE = /^(done|closed|resolved|complete|hoàn thành|đã xong|đóng)/i
const REVIEW = /review/i

/**
 * Gợi ý bước chuyển trạng thái theo MR / PR nối với ticket (chỉ gợi ý, người dùng bấm mới làm):
 * có MR đã merge → bước sang "Done"; có MR đang mở → bước sang "In Review". Không gợi ý nếu ticket đã ở trạng thái đó.
 * Tên trạng thái mỗi workflow một khác nên so theo từ khóa trên tên đích của bước chuyển.
 */
export function suggestTransition(transitions: JiraTransition[], status: string, states: string[]): Suggestion | null {
  const find = (re: RegExp) => transitions.find((t) => re.test(t.to || t.name))
  if (states.includes('merged') && !DONE.test(status)) {
    const t = find(DONE)
    if (t) return { transition: t, reason: 'MR đã merge' }
  }
  if (states.includes('opened') && !states.includes('merged') && !REVIEW.test(status) && !DONE.test(status)) {
    const t = find(REVIEW)
    if (t) return { transition: t, reason: 'Có MR đang mở' }
  }
  return null
}
