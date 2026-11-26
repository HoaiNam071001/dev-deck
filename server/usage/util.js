const fs = require('fs')
const path = require('path')

/** Duyệt đệ quy, trả về các file có đuôi thuộc `exts`. Lỗi đọc thư mục con thì bỏ qua. */
function walk(dir, exts, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, exts, out)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
  }
  return out
}

// Cache theo file: chỉ parse lại khi mtime hoặc kích thước đổi.
const fileCache = new Map()
function parseCached(file, parse) {
  let st
  try { st = fs.statSync(file) } catch { fileCache.delete(file); return [] }
  const hit = fileCache.get(file)
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit.rows
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return hit ? hit.rows : [] }
  let rows = []
  try { rows = parse(text, file) } catch { /* định dạng lạ: bỏ qua file */ }
  fileCache.set(file, { mtime: st.mtimeMs, size: st.size, rows })
  return rows
}

function* jsonLines(text, needle) {
  for (const line of text.split('\n')) {
    if (needle && !line.includes(needle)) continue
    try { yield JSON.parse(line) } catch { /* dòng hỏng */ }
  }
}

const num = (v) => (Number.isFinite(v) ? v : 0)
const base = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p || '')

module.exports = { walk, parseCached, jsonLines, num, base }
