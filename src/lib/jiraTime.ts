/** "1h30m", "2h", "45m", "1.5h" → giây; không hiểu thì null. Phạm vi 1 phút – 24 giờ. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let s = 0
  if (/^\d+(\.\d+)?h$/.test(t)) s = parseFloat(t) * 3600
  else if (/^\d+m$/.test(t)) s = parseInt(t, 10) * 60
  else {
    const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(t)
    if (!m || (!m[1] && !m[2])) return null
    s = (m[1] ? parseInt(m[1], 10) * 3600 : 0) + (m[2] ? parseInt(m[2], 10) * 60 : 0)
  }
  s = Math.round(s)
  return s >= 60 && s <= 86400 ? s : null
}
