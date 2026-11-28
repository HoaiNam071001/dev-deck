const KEY = /\b[A-Za-z][A-Za-z0-9]+-\d+\b/

/** Mã ticket từ chữ người dùng dán: mã trơn (`pg-5126`), link `/browse/PG-5126`, link board `?selectedIssue=PG-5126`. Không có thì null. */
export function ticketKey(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  let hay = t
  try {
    const u = new URL(t)
    // Ưu tiên chỗ Jira đặt mã: /browse/KEY hoặc tham số selectedIssue / issueKey
    hay = u.searchParams.get('selectedIssue') || u.searchParams.get('issueKey') || u.pathname.split('/browse/')[1]?.split('/')[0] || u.pathname + ' ' + u.search
  } catch { /* không phải URL: coi là mã trơn */ }
  return hay.match(KEY)?.[0].toUpperCase() ?? null
}
