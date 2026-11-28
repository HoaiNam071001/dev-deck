/** Bỏ dấu tiếng Việt, chỉ giữ a-z 0-9 và dấu gạch; cắt ở ranh giới từ. */
export function slugify(text: string, max = 40): string {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const i = cut.lastIndexOf('-')
  return (i > 10 ? cut.slice(0, i) : cut).replace(/-+$/, '')
}

const PREFIX: Record<string, string> = { bug: 'fix', defect: 'fix', 'sub-bug': 'fix', hotfix: 'hotfix', task: 'feature', story: 'feature', epic: 'feature' }

export const DEFAULT_BRANCH_TEMPLATE = '{type}/{key}-{slug}'

/** Tên nhánh theo mẫu: {type} (Bug → fix, còn lại feature), {key} mã ticket, {slug} tóm tắt không dấu. Người dùng sửa được trước khi tạo. */
export function branchName(issue: { key: string; summary: string; type: string }, template = DEFAULT_BRANCH_TEMPLATE): string {
  const type = PREFIX[issue.type.toLowerCase()] ?? 'feature'
  const t = template.trim() || DEFAULT_BRANCH_TEMPLATE
  // Tóm tắt rỗng thì bỏ dấu gạch / gạch chéo thừa ở cuối
  return t.replaceAll('{type}', type).replaceAll('{key}', issue.key).replaceAll('{slug}', slugify(issue.summary)).replace(/[-/]+$/, '')
}

/** Tiêu đề và mô tả MR / PR tự điền từ ticket. */
export const crDraft = (issue: { key: string; summary: string; url: string }) => ({ title: `${issue.key}: ${issue.summary}`, description: `Ticket: ${issue.url}` })
