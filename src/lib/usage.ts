import type { Provider, UsageRow } from '../types'
import { dayKey, p2 } from './format'

export const KEYS = [
  { k: 'input', label: 'Input', color: 'var(--series-input)' },
  { k: 'output', label: 'Output', color: 'var(--series-output)' },
  { k: 'cacheWrite', label: 'Cache ghi', color: 'var(--series-cache-write)' },
  { k: 'cacheRead', label: 'Cache đọc', color: 'var(--series-cache-read)' },
] as const

export const PROVIDERS: { id: Provider; label: string; color: string }[] = [
  { id: 'claude', label: 'Claude', color: '#D97757' },
  { id: 'codex', label: 'Codex', color: '#10A37F' },
  { id: 'gemini', label: 'Gemini', color: '#4C8DF6' },
  { id: 'antigravity', label: 'Antigravity', color: '#8B5CF6' },
]
export const providerOf = (id: string) => PROVIDERS.find((p) => p.id === id)

export type Totals = { input: number; output: number; cacheWrite: number; cacheRead: number; msgs: number }
export type Group = Totals & { k: string }

export const totalOf = (s: Totals) => s.input + s.output + s.cacheWrite + s.cacheRead

export function sum(rows: UsageRow[]): Totals {
  const s: Totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, msgs: rows.length }
  for (const r of rows) { s.input += r.input; s.output += r.output; s.cacheWrite += r.cacheWrite; s.cacheRead += r.cacheRead }
  return s
}

export function group<K extends string | number>(rows: UsageRow[], f: (r: UsageRow) => K): (Totals & { k: K })[] {
  const m = new Map<K, UsageRow[]>()
  for (const r of rows) {
    const k = f(r)
    const list = m.get(k)
    if (list) list.push(r); else m.set(k, [r])
  }
  return [...m].map(([k, v]) => ({ k, ...sum(v) }))
}

/** range: 'h1' | 'h6' | 'h24' (giờ qua) | số ngày ('1' = hôm nay) | '0' = tất cả */
export function filterRows(rows: UsageRow[], range: string, project: string, provider = ''): UsageRow[] {
  let since: Date | null = null
  if (range[0] === 'h') since = new Date(Date.now() - Number(range.slice(1)) * 36e5)
  else if (Number(range)) since = new Date(new Date().setHours(0, 0, 0, 0) - (Number(range) - 1) * 864e5)
  return rows.filter((r) => (!since || new Date(r.t) >= since) && (!project || r.project === project) && (!provider || r.provider === provider))
}

const AUTO_GRAN: Record<string, number> = { h1: 1, h6: 5, h24: 60, '1': 60, '7': 360, '30': 1440, '0': 1440 }
export const granOf = (gran: number, range: string) => gran || AUTO_GRAN[range] || 1440

export interface Bucket extends Totals { b: number; date: string; time: string; byProvider: Record<Provider, number> }

/** Gom theo mốc `g` phút (theo giờ địa phương), điền mốc trống để trục thời gian liền mạch. */
export function buckets(rows: UsageRow[], g: number): Bucket[] {
  if (!rows.length) return []
  const tz = new Date().getTimezoneOffset() * 6e4
  const ms = g * 6e4
  const grouped = new Map(group(rows, (r) => Math.floor((new Date(r.t).getTime() - tz) / ms) * ms + tz).map((x) => [x.k, x]))
  const prov = new Map<number, Partial<Record<Provider, number>>>()
  for (const r of rows) {
    const b = Math.floor((new Date(r.t).getTime() - tz) / ms) * ms + tz
    const o = prov.get(b) ?? {}
    o[r.provider] = (o[r.provider] ?? 0) + r.input + r.output + r.cacheWrite + r.cacheRead
    prov.set(b, o)
  }
  const ks = [...grouped.keys()]
  const lo = Math.min(...ks), hi = Math.max(...ks)
  const out: Bucket[] = []
  for (let b = lo; b <= hi && out.length < 3000; b += ms) {
    const d = new Date(b)
    const t = grouped.get(b)
    out.push({
      input: t?.input ?? 0, output: t?.output ?? 0, cacheWrite: t?.cacheWrite ?? 0, cacheRead: t?.cacheRead ?? 0, msgs: t?.msgs ?? 0,
      byProvider: { claude: 0, codex: 0, gemini: 0, antigravity: 0, ...prov.get(b) },
      b, date: dayKey(d).slice(5), time: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
    })
  }
  return out
}
