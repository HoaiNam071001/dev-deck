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

export interface Bucket extends Totals { b: number; date: string; time: string; byProvider: Record<Provider, number>; bySeries: Record<string, number> }

/** Màu cho các dự án khi chia biểu đồ theo dự án; "Khác" dùng màu xám. */
export const SERIES_COLORS = ['#5AA9F5', '#F2A65A', '#B18CF2', '#30CF43', '#F26BA8', '#4FD1C5']
export const OTHER_KEY = '__other'
export const OTHER_COLOR = '#6B7A90'

/** Các dự án lớn nhất (theo tổng token) + "Khác" nếu còn dư, để vẽ biểu đồ chồng theo dự án. */
export function topSeries(rows: UsageRow[], n = SERIES_COLORS.length): { k: string; label: string; color: string }[] {
  const g = group(rows, (r) => r.project).sort((a, b) => totalOf(b) - totalOf(a))
  const out = g.slice(0, n).map((x, i) => ({ k: x.k, label: x.k, color: SERIES_COLORS[i] }))
  if (g.length > n) out.push({ k: OTHER_KEY, label: 'Khác', color: OTHER_COLOR })
  return out
}

/** Gom theo mốc `g` phút (theo giờ địa phương), điền mốc trống để trục thời gian liền mạch. */
/** `seriesOf`: khóa chuỗi cho biểu đồ chồng tùy ý (vd. theo dự án); khóa không có trong `known` gộp vào OTHER_KEY. */
export function buckets(rows: UsageRow[], g: number, seriesOf?: (r: UsageRow) => string, known?: Set<string>): Bucket[] {
  if (!rows.length) return []
  const tz = new Date().getTimezoneOffset() * 6e4
  const ms = g * 6e4
  const grouped = new Map(group(rows, (r) => Math.floor((new Date(r.t).getTime() - tz) / ms) * ms + tz).map((x) => [x.k, x]))
  const prov = new Map<number, Partial<Record<Provider, number>>>()
  const ser = new Map<number, Record<string, number>>()
  for (const r of rows) {
    const b = Math.floor((new Date(r.t).getTime() - tz) / ms) * ms + tz
    const o = prov.get(b) ?? {}
    o[r.provider] = (o[r.provider] ?? 0) + r.input + r.output + r.cacheWrite + r.cacheRead
    prov.set(b, o)
    if (seriesOf) {
      let k = seriesOf(r)
      if (known && !known.has(k)) k = OTHER_KEY
      const s = ser.get(b) ?? {}
      s[k] = (s[k] ?? 0) + r.input + r.output + r.cacheWrite + r.cacheRead
      ser.set(b, s)
    }
  }
  const ks = [...grouped.keys()]
  const lo = Math.min(...ks), hi = Math.max(...ks)
  const out: Bucket[] = []
  for (let b = lo; b <= hi && out.length < 3000; b += ms) {
    const d = new Date(b)
    const t = grouped.get(b)
    out.push({
      input: t?.input ?? 0, output: t?.output ?? 0, cacheWrite: t?.cacheWrite ?? 0, cacheRead: t?.cacheRead ?? 0, msgs: t?.msgs ?? 0,
      byProvider: { claude: 0, codex: 0, gemini: 0, antigravity: 0, ...prov.get(b) }, bySeries: ser.get(b) ?? {},
      b, date: dayKey(d).slice(5), time: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
    })
  }
  return out
}

// ── Theo nhánh git / theo phiên (giai đoạn 11) ──

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Repo (trong danh sách đã quét) mà dòng log thuộc về: thư mục con → repo cha sâu nhất; worktree mặc định `<repo>-wt/<nhánh>` → repo chính. '' = ngoài repo. */
export function repoOfRow(r: Pick<UsageRow, 'cwd' | 'projectPath'>, repoPaths: string[]): string {
  const p = normPath(r.cwd || r.projectPath || '')
  if (!p) return ''
  let best = ''
  for (const rp of repoPaths) {
    const n = normPath(rp)
    if (n.length <= best.length) continue
    if (p === n || p.startsWith(n + '/') || p.startsWith(n + '-wt/')) best = n
  }
  return best ? repoPaths.find((x) => normPath(x) === best)! : ''
}

export interface BranchGroup extends Totals { repo: string; branch: string; sessions: number; last: string }

/** Gom theo repo + nhánh (không theo tên nhánh trần). Dòng không có nhánh gom vào branch ''. */
export function byBranch(rows: UsageRow[], repoPaths: string[]): BranchGroup[] {
  const m = new Map<string, { repo: string; branch: string; rows: UsageRow[]; sessions: Set<string>; last: string }>()
  for (const r of rows) {
    const repo = repoOfRow(r, repoPaths), branch = r.branch ?? ''
    const key = repo + '\0' + branch
    let g = m.get(key)
    if (!g) m.set(key, g = { repo, branch, rows: [], sessions: new Set(), last: '' })
    g.rows.push(r)
    if (r.session) g.sessions.add(r.session)
    if (r.t > g.last) g.last = r.t
  }
  return [...m.values()].map((g) => ({ repo: g.repo, branch: g.branch, sessions: g.sessions.size, last: g.last, ...sum(g.rows) }))
}

export interface SessionGroup extends Totals { session: string; provider: Provider; project: string; start: string; end: string; branches: string[]; models: string[] }

/** Mỗi phiên một dòng (chỉ dòng có `session`). */
export function bySession(rows: UsageRow[]): SessionGroup[] {
  const m = new Map<string, UsageRow[]>()
  for (const r of rows) {
    if (!r.session) continue
    const k = r.provider + '\0' + r.session
    const l = m.get(k)
    if (l) l.push(r); else m.set(k, [r])
  }
  return [...m.values()].map((l) => {
    const ts = l.map((r) => r.t).sort()
    return {
      session: l[0].session!, provider: l[0].provider, project: l[0].project, start: ts[0], end: ts[ts.length - 1],
      branches: [...new Set(l.map((r) => r.branch).filter((b): b is string => !!b))],
      models: [...new Set(l.map((r) => r.model))], ...sum(l),
    }
  })
}

export interface BranchTokens { total: number; today: number; msgs: number; byModel: Record<string, number> }

/** Token theo từng nhánh của MỘT repo (khóa = tên nhánh). `repoPaths` = mọi repo đã quét, để dòng log ở worktree / thư mục con map đúng repo. */
export function repoBranchTokens(rows: UsageRow[], repoPath: string, repoPaths: string[], now = new Date()): Map<string, BranchTokens> {
  const day0 = new Date(now).setHours(0, 0, 0, 0)
  const out = new Map<string, BranchTokens>()
  const me = normPath(repoPath)
  for (const r of rows) {
    if (!r.branch) continue
    const repo = repoOfRow(r, repoPaths)
    if (!repo || normPath(repo) !== me) continue
    const n = r.input + r.output + r.cacheWrite + r.cacheRead
    const b = out.get(r.branch) ?? { total: 0, today: 0, msgs: 0, byModel: {} }
    b.total += n; b.msgs++
    if (new Date(r.t).getTime() >= day0) b.today += n
    b.byModel[r.model] = (b.byModel[r.model] ?? 0) + n
    out.set(r.branch, b)
  }
  return out
}
