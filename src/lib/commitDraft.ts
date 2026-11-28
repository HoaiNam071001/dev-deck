/** Bản nháp commit theo repo, giữ trong bộ nhớ để không mất khi khung chi tiết gắn lại (đổi panel ↔ cửa sổ nổi, đổi repo). */
const drafts = new Map<string, { message: string; amend: boolean }>()

export const readDraft = (path: string) => drafts.get(path) ?? { message: '', amend: false }
export function writeDraft(path: string, d: { message: string; amend: boolean }) {
  if (d.message || d.amend) drafts.set(path, d)
  else drafts.delete(path)
}
