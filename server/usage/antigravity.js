const fs = require('fs')
const path = require('path')
const os = require('os')
const { jsonLines, num } = require('./util')

const HOME = process.env.ANTIGRAVITY_DIR || path.join(os.homedir(), '.gemini', 'antigravity')
const ROOT = path.join(HOME, 'brain')
const PROJECTS = path.join(path.dirname(HOME), 'projects.json')

const norm = (s) => s.toLowerCase().replace(/[\\/]+/g, '/')

/** Workspace đã biết: { đường dẫn chuẩn hoá → tên }. Đọc từ ~/.gemini/projects.json nếu có. */
function knownProjects() {
  try {
    const o = JSON.parse(fs.readFileSync(PROJECTS, 'utf8')).projects || {}
    return Object.entries(o).map(([p, name]) => ({ key: norm(p), name: String(name) }))
  } catch { return [] }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Transcript không ghi project: đếm xem workspace nào được nhắc tới nhiều nhất, không có thì dùng mã hội thoại. */
function projectOf(text, convId) {
  const t = norm(text)
  let best = null
  for (const p of knownProjects()) {
    // Phần sau đường dẫn không được là ký tự tên (tránh "goerp" khớp nhầm "goerp-web")
    const n = (t.match(new RegExp(esc(p.key) + '(?![\\w-])', 'g')) || []).length
    if (n && (!best || n > best.n)) best = { n, name: p.name }
  }
  return best ? best.name : 'agy-' + convId.slice(0, 8)
}

/**
 * brain/<convId>/.system_generated/logs/transcript.jsonl: mỗi lượt trả lời của model là một dòng
 * PLANNER_RESPONSE có input_tokens (chưa gồm cache), cache_read_tokens, output_tokens và model.
 */
function parse(text, file) {
  const convId = path.basename(path.dirname(path.dirname(path.dirname(file))))
  const project = projectOf(text, convId)
  const rows = []
  let n = 0
  for (const o of jsonLines(text, '"PLANNER_RESPONSE"')) {
    n++
    if (o.type !== 'PLANNER_RESPONSE' || !o.created_at || (o.status && o.status !== 'DONE')) continue
    if (![o.input_tokens, o.output_tokens, o.cache_read_tokens].some(Number.isFinite)) continue
    rows.push({
      id: `${convId}#${o.step_index ?? n}`,
      t: o.created_at,
      project,
      model: o.model || 'unknown',
      input: num(o.input_tokens),
      output: num(o.output_tokens),
      cacheWrite: 0,
      cacheRead: num(o.cache_read_tokens),
    })
  }
  return rows
}

/** Chỉ xem thư mục cấp 1 của brain/ để khỏi duyệt các file output lớn bên trong. */
function files() {
  const out = []
  for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const f = path.join(ROOT, d.name, '.system_generated', 'logs', 'transcript.jsonl')
    if (fs.existsSync(f)) out.push(f)
  }
  return out
}

module.exports = { id: 'antigravity', label: 'Antigravity', root: ROOT, files, parse }
