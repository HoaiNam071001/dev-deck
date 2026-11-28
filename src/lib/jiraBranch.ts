/** Bỏ dấu tiếng Việt, chỉ giữ a-z 0-9 và dấu gạch; cắt ở ranh giới từ. */
export function slugify(text: string, max = 40): string {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const i = cut.lastIndexOf('-')
  return (i > 10 ? cut.slice(0, i) : cut).replace(/-+$/, '')
}

const PREFIX: Record<string, string> = { bug: 'fix', defect: 'fix', 'sub-bug': 'fix', hotfix: 'hotfix', task: 'feature', story: 'feature', epic: 'feature' }

/** Tên nhánh gợi ý `<loại>/<KEY>-<tóm-tắt>`: Bug → fix/, còn lại feature/. Người dùng sửa được trước khi tạo. */
export function branchName(issue: { key: string; summary: string; type: string }): string {
  const slug = slugify(issue.summary)
  return `${PREFIX[issue.type.toLowerCase()] ?? 'feature'}/${issue.key}${slug ? '-' + slug : ''}`
}

/** Tiêu đề và mô tả MR / PR tự điền từ ticket. */
export const crDraft = (issue: { key: string; summary: string; url: string }) => ({ title: `${issue.key}: ${issue.summary}`, description: `Ticket: ${issue.url}` })
