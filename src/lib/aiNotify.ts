import type { AiDoneEvent, AiNotifyConfig } from '../types'

type Rule = AiNotifyConfig['rules'][number]

/** Giống `normPath` ở server/usage/notify-config.js: '/', bỏ '/' cuối, không phân biệt hoa thường. */
export const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() || '/'

/** Quy tắc có đường dẫn dài nhất chứa `path` (khớp theo thư mục, `/a/app` không khớp `/a/app2`). */
export function ruleFor(rules: Rule[], path: string): Rule | null {
  const p = normPath(path)
  let best: Rule | null = null
  let len = -1
  for (const r of rules) {
    const n = normPath(r.path)
    if ((n === '/' || p === n || p.startsWith(n + '/')) && n.length > len) { best = r; len = n.length }
  }
  return best
}

/** Trạng thái hiệu lực của một thư mục và nơi nó đến từ đâu: 'self' (quy tắc riêng), 'parent' (thư mục cha), 'default' (bật mặc định). */
export function effective(rules: Rule[], path: string): { on: boolean; from: 'self' | 'parent' | 'default'; rule: Rule | null } {
  const r = ruleFor(rules, path)
  if (!r) return { on: true, from: 'default', rule: null }
  return { on: r.enabled, from: normPath(r.path) === normPath(path) ? 'self' : 'parent', rule: r }
}

/** Đặt bật / tắt cho một thư mục; nếu kết quả trùng với thừa hưởng thì bỏ quy tắc riêng cho danh sách gọn. */
export function setPath(rules: Rule[], path: string, on: boolean): Rule[] {
  const key = normPath(path)
  const rest = rules.filter((r) => normPath(r.path) !== key)
  return effective(rest, path).on === on ? rest : [...rest, { path: path.replace(/[\\/]+$/, '') || path, enabled: on }]
}

export const SOURCE_LABEL: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', antigravity: 'Antigravity' }

export function formatDuration(sec: number | null): string {
  if (sec === null) return ''
  if (sec < 60) return `${sec} giây`
  const m = Math.floor(sec / 60)
  return m < 60 ? `${m} phút ${sec % 60} giây` : `${Math.floor(m / 60)} giờ ${m % 60} phút`
}

/** Nội dung thông báo cho một hoặc nhiều sự kiện xong cùng lúc. */
export function doneMessage(events: AiDoneEvent[]): { title: string; body: string } {
  const one = (e: AiDoneEvent) => ({ title: `${SOURCE_LABEL[e.source] ?? e.source} đã xong`, body: [e.project || e.session, formatDuration(e.durationSec)].filter(Boolean).join(' · ') })
  if (events.length === 1) return one(events[0])
  return { title: `${events.length} phiên AI đã xong`, body: events.slice(0, 3).map((e) => `${SOURCE_LABEL[e.source] ?? e.source}: ${e.project || e.session}`).join('\n') }
}
