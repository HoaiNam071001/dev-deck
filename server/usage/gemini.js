const fs = require('fs')
const path = require('path')
const os = require('os')
const { walk, jsonLines, num, base } = require('./util')

const ROOT = path.join(process.env.GEMINI_DIR || path.join(os.homedir(), '.gemini'), 'tmp')

const names = new Map()
/** Thư mục dự án là hash của cwd: ưu tiên .project_root nếu có, không thì hash rút gọn. */
function projectOf(file) {
  const dir = path.relative(ROOT, file).split(path.sep)[0]
  if (names.has(dir)) return names.get(dir)
  let name = dir
  if (/^[0-9a-f]{32,}$/i.test(dir)) {
    try { name = base(fs.readFileSync(path.join(ROOT, dir, '.project_root'), 'utf8').trim()) } catch { name = dir.slice(0, 8) }
  }
  names.set(dir, name)
  return name
}

/** Mỗi message `type: "gemini"` có tokens {input, output, cached, thoughts, tool}; input đã gồm cached. */
function toRow(m, project, fallbackId) {
  if (!m || m.type !== 'gemini' || !m.tokens || !m.timestamp) return null
  const k = m.tokens
  const cached = num(k.cached)
  return {
    id: m.id || fallbackId,
    t: m.timestamp,
    project,
    model: m.model || 'unknown',
    input: Math.max(0, num(k.input) - cached) + num(k.tool),
    output: num(k.output) + num(k.thoughts),
    cacheWrite: 0,
    cacheRead: cached,
    reasoning: num(k.thoughts),
  }
}

function parse(text, file) {
  const project = projectOf(file)
  const msgs = []
  if (file.endsWith('.jsonl')) { for (const o of jsonLines(text)) msgs.push(o) }
  else {
    const doc = JSON.parse(text)
    if (Array.isArray(doc.messages)) msgs.push(...doc.messages)
  }
  const rows = []
  msgs.forEach((m, i) => { const r = toRow(m, project, `${file}#${i}`); if (r) rows.push(r) })
  return rows
}

module.exports = {
  id: 'gemini',
  label: 'Gemini CLI',
  root: ROOT,
  files: () => walk(ROOT, ['.json', '.jsonl']).filter((f) => /[\\/]chats[\\/]/.test(f)),
  parse,
}
