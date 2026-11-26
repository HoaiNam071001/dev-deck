const fs = require('fs')
const { parseCached } = require('./util')

const ADAPTERS = [require('./claude'), require('./codex'), require('./gemini'), require('./antigravity')]

let cache = { at: 0, rows: [], sources: [] }

/** Gộp mọi adapter; adapter lỗi hoặc thiếu thư mục chỉ làm nguồn đó rỗng. Cache 5s, file chỉ đọc lại khi đổi mtime. */
function refresh() {
  if (Date.now() - cache.at < 5000) return cache
  const byId = new Map()
  const sources = ADAPTERS.map((a) => {
    const found = fs.existsSync(a.root)
    let files = []
    if (found) { try { files = a.files() } catch { /* bỏ qua */ } }
    let rows = 0
    for (const f of files) {
      for (const r of parseCached(f, a.parse)) {
        const key = a.id + ':' + r.id
        if (!byId.has(key)) { byId.set(key, { ...r, provider: a.id }); rows++ }
      }
    }
    return { id: a.id, label: a.label, root: a.root, found, files: files.length, rows }
  })
  const out = [...byId.values()].map(({ id, ...r }) => r)
  cache = { at: Date.now(), rows: out, sources }
  return cache
}

module.exports = { collect: () => refresh().rows, sources: () => refresh().sources, invalidate: () => { cache.at = 0 } }
