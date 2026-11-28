const path = require('path')
const profiles = require('./profiles')
const { walk, jsonLines, num } = require('./util')

const ROOT = path.join(profiles.DEFAULT_DIR, 'projects')

// Thư mục dự án mã hoá đường dẫn: "c--Users-name-Desktop-app" → "app"
const projectName = (dir) => dir.replace(/^[a-zA-Z]--Users-[^-]+-/, '').replace(/^-(Users|home)-[^-]+-/, '').replace(/^Desktop-/, '')

/** Mỗi tài khoản (thư mục cấu hình) có thư mục projects riêng; log được gắn nhãn `account` ('' = mặc định). */
const roots = () => profiles.dirs().map((d) => ({ dir: d, account: d === profiles.DEFAULT_DIR ? '' : d, root: path.join(d, 'projects') }))

/** Nhánh trống / HEAD (detached) → không có nhánh */
const cleanBranch = (b) => (typeof b === 'string' && b && b !== 'HEAD' ? b : undefined)

function parse(text, file) {
  const r = roots().find((x) => file.startsWith(x.root + path.sep)) || { account: '', root: ROOT }
  const fallback = projectName(path.relative(r.root, file).split(path.sep)[0])
  let project = fallback, projectPath = ''
  const rows = []
  for (const o of jsonLines(text, '"usage"')) {
    // Tên thư mục mã hoá làm mất dấu '-' thật, nên lấy cwd gốc trong log (cwd đầu tiên của phiên)
    if (!projectPath && typeof o.cwd === 'string' && o.cwd) { projectPath = o.cwd; project = path.win32.basename(o.cwd.replace(/[\\/]+$/, '')) || fallback }
    const m = o.message
    if (!m || !m.usage || !o.timestamp || m.model === '<synthetic>') continue
    const u = m.usage
    const branch = cleanBranch(o.gitBranch)
    const cwd = typeof o.cwd === 'string' && o.cwd && o.cwd !== projectPath ? o.cwd : undefined
    rows.push({
      ...(branch && { branch }),
      ...(typeof o.sessionId === 'string' && o.sessionId && { session: o.sessionId }),
      ...(cwd && { cwd }),
      id: m.id || o.uuid,
      t: o.timestamp,
      project,
      projectPath,
      account: r.account,
      model: m.model || 'unknown',
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheWrite: num(u.cache_creation_input_tokens),
      cacheRead: num(u.cache_read_input_tokens),
    })
  }
  return rows
}

/** Cuối log là lời đáp của model không kèm tool_use (và không phải subagent) thì lượt đã xong; trả về dòng đó làm chữ ký (để không báo lại khi chỉ có dòng system ghi thêm), '' nếu chưa xong. `tail` có thể bắt đầu giữa dòng. */
function isDone(tail) {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let o
    try { o = JSON.parse(lines[i]) } catch { continue }
    if (o.type !== 'assistant' && o.type !== 'user') continue
    if (o.type !== 'assistant' || o.isSidechain) return ''
    const c = o.message && o.message.content
    return Array.isArray(c) && c.some((b) => b && b.type === 'tool_use') ? '' : lines[i]
  }
  return ''
}

module.exports = {
  id: 'claude',
  label: 'Claude Code',
  root: ROOT,
  files: () => roots().flatMap((r) => walk(r.root, ['.jsonl'])),
  parse,
  isDone,
}
