const path = require('path')
const profiles = require('./profiles')
const { walk, jsonLines, num } = require('./util')

const ROOT = path.join(profiles.DEFAULT_DIR, 'projects')

// Thư mục dự án mã hoá đường dẫn: "c--Users-name-Desktop-app" → "app"
const projectName = (dir) => dir.replace(/^[a-zA-Z]--Users-[^-]+-/, '').replace(/^-(Users|home)-[^-]+-/, '').replace(/^Desktop-/, '')

/** Mỗi tài khoản (thư mục cấu hình) có thư mục projects riêng; log được gắn nhãn `account` ('' = mặc định). */
const roots = () => profiles.dirs().map((d) => ({ dir: d, account: d === profiles.DEFAULT_DIR ? '' : d, root: path.join(d, 'projects') }))

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
    rows.push({
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

module.exports = {
  id: 'claude',
  label: 'Claude Code',
  root: ROOT,
  files: () => roots().flatMap((r) => walk(r.root, ['.jsonl'])),
  parse,
}
