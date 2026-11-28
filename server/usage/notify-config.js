const fs = require('fs')
const path = require('path')

const FILE = () => path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data'), 'ai-notify.json')
const SOURCES = ['claude', 'codex', 'gemini', 'antigravity']
const MAX_RULES = 200

const defaults = () => ({ enabled: true, minSeconds: 30, debounceSeconds: 8, sources: Object.fromEntries(SOURCES.map((s) => [s, true])), rules: [] })

/** Chuẩn hoá để so tiền tố: dùng '/', bỏ '/' cuối, không phân biệt hoa thường (Windows / macOS). */
function normPath(p) {
  const s = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return s || '/'
}
const isAbs = (p) => /^([a-zA-Z]:[\\/]|\/|\\\\)/.test(p)

/** `strict` (khi người dùng lưu) ném lỗi; khi đọc file cũ chỉ bỏ phần hỏng, giữ phần còn lại. */
function sanitize(input, strict) {
  const c = defaults()
  const o = input && typeof input === 'object' ? input : {}
  const bad = (m) => { if (strict) throw new Error(m) }
  if (typeof o.enabled === 'boolean') c.enabled = o.enabled
  const int = (v, lo, hi, name, key) => {
    if (v === undefined) return
    if (!Number.isInteger(v) || v < lo || v > hi) return bad(`${name} phải là số nguyên từ ${lo} đến ${hi}`)
    c[key] = v
  }
  int(o.minSeconds, 0, 3600, 'Ngưỡng thời gian', 'minSeconds')
  int(o.debounceSeconds, 3, 120, 'Thời gian chờ log ngừng đổi', 'debounceSeconds')
  if (o.sources && typeof o.sources === 'object') for (const s of SOURCES) if (typeof o.sources[s] === 'boolean') c.sources[s] = o.sources[s]
  if (o.rules !== undefined) {
    if (!Array.isArray(o.rules)) bad('rules phải là danh sách')
    else {
      if (o.rules.length > MAX_RULES) bad(`Tối đa ${MAX_RULES} quy tắc`)
      const seen = new Map()
      for (const r of o.rules.slice(0, MAX_RULES)) {
        const p = r && typeof r.path === 'string' ? r.path.trim() : ''
        if (!p || p.length > 1000 || !isAbs(p) || typeof r.enabled !== 'boolean') { bad('Quy tắc cần đường dẫn tuyệt đối và enabled true/false'); continue }
        seen.set(normPath(p), { path: p.replace(/[\\/]+$/, '') || p, enabled: r.enabled })
      }
      c.rules = [...seen.values()]
    }
  }
  return c
}

function load() {
  try { return sanitize(JSON.parse(fs.readFileSync(FILE(), 'utf8')), false) } catch { return defaults() }
}

function save(body) {
  const c = sanitize(body, true)
  fs.mkdirSync(path.dirname(FILE()), { recursive: true })
  fs.writeFileSync(FILE(), JSON.stringify(c, null, 2))
  return c
}

/** Quy tắc có đường dẫn dài nhất chứa `projectPath` (khớp theo thư mục, không khớp `/a/app` với `/a/app2`). */
function ruleFor(config, projectPath) {
  if (!projectPath) return null
  const p = normPath(projectPath)
  let best = null, bestLen = -1
  for (const r of config.rules) {
    const n = normPath(r.path)
    const hit = n === '/' || p === n || p.startsWith(n + '/')
    if (hit && n.length > bestLen) { best = r; bestLen = n.length }
  }
  return best
}

/** Sự kiện có được báo không. `durationSec` null = không biết thì không chặn theo ngưỡng. */
function allows(config, { source, projectPath, durationSec }) {
  if (!config.enabled) return false
  if (config.sources[source] === false) return false
  const r = ruleFor(config, projectPath)
  if (r && !r.enabled) return false
  if (typeof durationSec === 'number' && durationSec < config.minSeconds) return false
  return true
}

module.exports = { SOURCES, defaults, load, save, sanitize, normPath, ruleFor, allows }
