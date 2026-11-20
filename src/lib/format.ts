export const fmt = (n: number) => n.toLocaleString('vi-VN')

export const short = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

export const projName = (p: string) => p.replace(/^c--Users-[^-]+-/, '').replace(/^Desktop-/, '')

export const p2 = (n: number) => String(n).padStart(2, '0')

export const dayKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

export function relTime(iso: string | undefined | null): string {
  if (!iso) return '—'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'vừa xong'
  if (s < 3600) return Math.floor(s / 60) + ' phút trước'
  if (s < 86400) return Math.floor(s / 3600) + ' giờ trước'
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' ngày trước'
  if (s < 86400 * 365) return Math.floor(s / 86400 / 30) + ' tháng trước'
  return Math.floor(s / 86400 / 365) + ' năm trước'
}
