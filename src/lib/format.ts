export const fmt = (n: number) => n.toLocaleString('vi-VN')

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',')

/** Số token dạng chữ tiếng Việt: 266,8K · 21,3M · 1,2B. */
export const short = (n: number) =>
  n >= 1e9 ? dec(n / 1e9, 2) + 'B' : n >= 1e6 ? dec(n / 1e6, n >= 1e7 ? 1 : 2) + 'M' : n >= 1e3 ? dec(n / 1e3, n >= 1e5 ? 0 : 1) + 'K' : String(n)

/** Nhãn trục biểu đồ tách số và đơn vị (cùng K / M / B như chỗ khác): 12,6 + M · 266 + K · 4,2 + M. */
export const axisParts = (n: number): [string, 'K' | 'M' | 'B' | ''] => {
  const t = (v: number) => dec(v, 1).replace(/,0$/, '')
  return n >= 1e9 ? [t(n / 1e9), 'B'] : n >= 1e6 ? [t(n / 1e6), 'M'] : n >= 1e3 ? [Math.round(n / 1e3) + '', 'K'] : [String(n), '']
}

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
