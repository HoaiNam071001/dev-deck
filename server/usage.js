const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.join(os.homedir(), '.claude', 'projects')
let cache = { at: 0, rows: [] }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.jsonl')) out.push(p)
  }
  return out
}

function collect() {
  if (Date.now() - cache.at < 5000) return cache.rows
  const byId = new Map()
  if (fs.existsSync(ROOT)) {
    for (const file of walk(ROOT)) {
      const project = path.relative(ROOT, file).split(path.sep)[0]
      let text
      try { text = fs.readFileSync(file, 'utf8') } catch { continue }
      for (const line of text.split('\n')) {
        if (!line.includes('"usage"')) continue
        let o
        try { o = JSON.parse(line) } catch { continue }
        const m = o.message
        if (!m || !m.usage || !o.timestamp) continue
        const u = m.usage
        byId.set(m.id || o.uuid, {
          t: o.timestamp,
          project,
          model: m.model || 'unknown',
          input: u.input_tokens || 0,
          output: u.output_tokens || 0,
          cacheWrite: u.cache_creation_input_tokens || 0,
          cacheRead: u.cache_read_input_tokens || 0,
        })
      }
    }
  }
  cache = { at: Date.now(), rows: [...byId.values()].filter((r) => r.model !== '<synthetic>') }
  return cache.rows
}

module.exports = { collect }
