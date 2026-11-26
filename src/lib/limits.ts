import type { Provider, UsageRow } from '../types'

/** Token "tính vào hạn mức": input + output + cache ghi. Cache đọc rất rẻ và thường không tính, nên bỏ ra để số liệu sát thực tế hơn. */
export const effective = (r: Pick<UsageRow, 'input' | 'output' | 'cacheWrite'>) => r.input + r.output + r.cacheWrite

const H = 36e5
export const WINDOWS = { five: 5 * H, week: 7 * 24 * H }

export interface WindowStat {
  used: number
  /** Mức dùng cao nhất của một cửa sổ cùng loại trong lịch sử (thước đo khi chưa đặt hạn mức) */
  peak: number
  /** Cửa sổ 5h: còn đang chạy không, và khi nào reset */
  active?: boolean
  resetAt?: number
}
export interface ProviderWindows { provider: Provider; five: WindowStat; week: WindowStat; msgs5: number }

/** Cửa sổ 5h kiểu Claude: bắt đầu từ tin đầu tiên (làm tròn xuống giờ), kéo dài 5h. Tin sau đó mở cửa sổ mới. */
function fiveHour(times: number[], vals: number[], now: number): WindowStat & { msgs: number } {
  let start = -Infinity, sum = 0, msgs = 0, peak = 0
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= start + WINDOWS.five) {
      peak = Math.max(peak, sum)
      start = Math.floor(times[i] / H) * H
      sum = 0; msgs = 0
    }
    sum += vals[i]; msgs++
  }
  peak = Math.max(peak, sum)
  const active = times.length > 0 && now < start + WINDOWS.five
  return { used: active ? sum : 0, msgs: active ? msgs : 0, peak, active, resetAt: active ? start + WINDOWS.five : undefined }
}

/** Tổng 7 ngày gần nhất + đỉnh của mọi cửa sổ 7 ngày trong lịch sử. */
function week(times: number[], vals: number[], now: number): WindowStat & { msgs: number } {
  let lo = 0, sum = 0, peak = 0
  for (let i = 0; i < times.length; i++) {
    sum += vals[i]
    while (times[i] - times[lo] >= WINDOWS.week) sum -= vals[lo++]
    peak = Math.max(peak, sum)
  }
  let used = 0, msgs = 0
  for (let i = times.length - 1; i >= 0 && now - times[i] < WINDOWS.week; i--) { used += vals[i]; msgs++ }
  return { used, peak, msgs }
}

function rollingOrAnchored(times: number[], vals: number[], now: number, spanMs: number, resetAt?: number): WindowStat & { msgs: number } {
  const base = spanMs === WINDOWS.five ? fiveHour(times, vals, now) : week(times, vals, now)
  if (!resetAt || !Number.isFinite(resetAt)) return base
  let next = resetAt
  while (next <= now) next += spanMs
  const start = next - spanMs
  let used = 0, msgs = 0
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= start && times[i] < next) { used += vals[i]; msgs++ }
  }
  return { used, peak: Math.max(base.peak, used), active: true, resetAt: next, msgs }
}

export const isGeminiModel = (model: string) => /^gemini/i.test(model)

/** Phân tích chuỗi thời gian còn lại như "6d 23h", "4h 07m", "4h07", "30m" thành milliseconds. */
export function parseResetOffset(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * H
  let ms = 0, matched = false
  const d = s.match(/(\d+(?:\.\d+)?)\s*d/)
  if (d) { ms += Number(d[1]) * 24 * H; matched = true }
  const hm = s.match(/(\d+)\s*h\s*(\d+)(?!\s*[dhm])/)
  if (hm) { ms += Number(hm[1]) * H + Number(hm[2]) * 6e4; matched = true }
  else {
    const h = s.match(/(\d+(?:\.\d+)?)\s*h/)
    if (h) { ms += Number(h[1]) * H; matched = true }
    const m = s.match(/(\d+(?:\.\d+)?)\s*m/)
    if (m) { ms += Number(m[1]) * 6e4; matched = true }
  }
  return matched && ms > 0 ? ms : null
}

export interface AntigravityResets { geminiWeek?: number; claudeFive?: number; claudeWeek?: number }
export interface AntigravityWindows {
  gemini: { week: WindowStat; msgsWeek: number }
  claudeGpt: { five: WindowStat; week: WindowStat; msgs5: number; msgsWeek: number }
}

/** Antigravity tách riêng 2 nhóm quota: Gemini Models (tuần) và Claude & GPT (5h + tuần). */
export function antigravityWindows(rows: UsageRow[], now = Date.now(), resets: AntigravityResets = {}): AntigravityWindows {
  const toSeries = (list: UsageRow[]) => {
    const pts = list.map((r) => ({ t: new Date(r.t).getTime(), v: effective(r) })).sort((a, b) => a.t - b.t)
    return { times: pts.map((x) => x.t), vals: pts.map((x) => x.v) }
  }
  const agy = rows.filter((r) => r.provider === 'antigravity')
  const g = toSeries(agy.filter((r) => isGeminiModel(r.model)))
  const c = toSeries(agy.filter((r) => !isGeminiModel(r.model)))
  const { msgs: gMsgs, ...gWeek } = rollingOrAnchored(g.times, g.vals, now, WINDOWS.week, resets.geminiWeek)
  const { msgs: c5Msgs, ...cFive } = rollingOrAnchored(c.times, c.vals, now, WINDOWS.five, resets.claudeFive)
  const { msgs: cwMsgs, ...cWeek } = rollingOrAnchored(c.times, c.vals, now, WINDOWS.week, resets.claudeWeek)
  return {
    gemini: { week: gWeek, msgsWeek: gMsgs },
    claudeGpt: { five: cFive, week: cWeek, msgs5: c5Msgs, msgsWeek: cwMsgs },
  }
}

export function providerWindows(rows: UsageRow[], now = Date.now()): ProviderWindows[] {
  const by = new Map<Provider, { t: number; v: number }[]>()
  for (const r of rows) {
    const l = by.get(r.provider) ?? []
    l.push({ t: new Date(r.t).getTime(), v: effective(r) })
    by.set(r.provider, l)
  }
  return [...by].map(([provider, l]) => {
    l.sort((a, b) => a.t - b.t)
    const times = l.map((x) => x.t), vals = l.map((x) => x.v)
    const { msgs, ...five } = fiveHour(times, vals, now)
    const { msgs: _mw, ...w } = week(times, vals, now)
    return { provider, five, week: w, msgs5: msgs }
  })
}

export interface Tier { id: 'idle' | 'light' | 'moderate' | 'heavy' | 'max'; label: string; color: string }
const TIERS: Tier[] = [
  { id: 'idle', label: 'Chưa dùng', color: 'var(--fg-mute)' },
  { id: 'light', label: 'Nhẹ', color: 'var(--accent)' },
  { id: 'moderate', label: 'Vừa', color: 'var(--accent)' },
  { id: 'heavy', label: 'Nhiều', color: 'var(--behind)' },
  { id: 'max', label: 'Gần chạm trần', color: 'var(--danger)' },
]
/** ratio = used / (hạn mức hoặc đỉnh cá nhân) */
export function tierOf(ratio: number): Tier {
  if (ratio <= 0) return TIERS[0]
  if (ratio < 0.25) return TIERS[1]
  if (ratio < 0.6) return TIERS[2]
  if (ratio < 0.85) return TIERS[3]
  return TIERS[4]
}

/** Mức của hôm nay so với các ngày trước đó của chính bạn (tỉ lệ ngày bạn dùng ít hơn hôm nay). */
export function dayRank(rows: UsageRow[], now = new Date()) {
  const key = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
  const today = key(now)
  const days = new Map<number, number>()
  for (const r of rows) { const k = key(new Date(r.t)); days.set(k, (days.get(k) ?? 0) + effective(r)) }
  const todayV = days.get(today) ?? 0
  const prev = [...days].filter(([k, v]) => k !== today && v > 0).map(([, v]) => v).sort((a, b) => a - b)
  if (!prev.length) return null
  const below = prev.filter((v) => v < todayV).length
  return { today: todayV, rank: below / prev.length, median: prev[Math.floor(prev.length / 2)], days: prev.length }
}
