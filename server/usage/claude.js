const path = require('path')
const os = require('os')
const { walk, jsonLines, num } = require('./util')

const ROOT = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects')

// Thư mục dự án mã hoá đường dẫn: "c--Users-name-Desktop-app" → "app"
const projectName = (dir) => dir.replace(/^[a-zA-Z]--Users-[^-]+-/, '').replace(/^-(Users|home)-[^-]+-/, '').replace(/^Desktop-/, '')

function parse(text, file) {
  const project = projectName(path.relative(ROOT, file).split(path.sep)[0])
  const rows = []
  for (const o of jsonLines(text, '"usage"')) {
    const m = o.message
    if (!m || !m.usage || !o.timestamp || m.model === '<synthetic>') continue
    const u = m.usage
    rows.push({
      id: m.id || o.uuid,
      t: o.timestamp,
      project,
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
  files: () => walk(ROOT, ['.jsonl']),
  parse,
}
