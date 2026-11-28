const fs = require('fs')
const path = require('path')
const profiles = require('./profiles')
const notifyConfig = require('./notify-config')
const claudeHook = require('./claude-hook')
const { parseCached } = require('./util')

const ADAPTERS = [require('./claude'), require('./codex'), require('./gemini'), require('./antigravity')]
const TAIL = 256 * 1024
const WHOLE_MAX = 8 * 1024 * 1024
const RELIST_MS = 15000
const HOT_MS = 15 * 60 * 1000
const MAX_EVENTS = 50

let seq = 0
const events = []
const state = new Map() // file → { mtime, turnStart, lastChange, pending }
let listed = { at: 0, files: [], hooked: new Set() }
let seeded = false

/** Sự kiện đã lọc theo cấu hình; `id` tăng dần để giao diện hỏi tiếp từ `since`. */
function emit(ev) {
  if (!notifyConfig.allows(notifyConfig.load(), ev)) return null
  const e = { id: ++seq, ...ev }
  events.push(e)
  if (events.length > MAX_EVENTS) events.shift()
  return e
}

function readText(file, whole) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    if (whole && size > WHOLE_MAX) return null
    const len = whole ? size : Math.min(size, TAIL)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    let s = buf.toString('utf8')
    if (!whole && size > len) s = s.slice(s.indexOf('\n') + 1) // bỏ dòng đứt giữa chừng
    return s
  } catch { return null } finally { if (fd !== undefined) try { fs.closeSync(fd) } catch { /* đã đóng */ } }
}

const claudeSettings = (dir) => path.join(dir, 'settings.json')

/** Thư mục cấu hình Claude đã cài hook Stop của DevDeck: log của chúng không cần đoán nữa. */
function hookedDirs() {
  const out = new Set()
  try { for (const d of profiles.dirs()) if (claudeHook.installedIn(claudeSettings(d))) out.add(path.join(d, 'projects') + path.sep) } catch { /* bỏ qua */ }
  return out
}

function relist(now) {
  const files = []
  for (const a of ADAPTERS) {
    if (!fs.existsSync(a.root)) continue
    try { for (const f of a.files()) files.push({ file: f, a }) } catch { /* nguồn lỗi chỉ làm nguồn đó rỗng */ }
  }
  listed = { at: now, files, hooked: hookedDirs() }
}

/**
 * Một nhịp: phát hiện file log đổi, chờ log ngừng đổi `debounceSeconds` rồi mới hỏi adapter xem lượt đã xong chưa.
 * Lần chạy đầu chỉ ghi nhận mtime hiện tại để không báo lại việc cũ.
 */
function tick(now = Date.now()) {
  const cfg = notifyConfig.load()
  if (!cfg.enabled) { seeded = false; state.clear(); return }
  const full = now - listed.at >= RELIST_MS
  if (full) relist(now)
  for (const { file, a } of listed.files) {
    let st = state.get(file)
    if (!full && seeded && !(st && now - st.mtime < HOT_MS)) continue
    let mtime
    try { mtime = fs.statSync(file).mtimeMs } catch { state.delete(file); continue }
    if (!st) { st = { mtime, turnStart: null, lastChange: now, pending: false }; state.set(file, st); if (!seeded) continue; st.mtime = 0 }
    if (mtime !== st.mtime) {
      if (!st.turnStart) st.turnStart = mtime
      st.mtime = mtime; st.lastChange = now; st.pending = true
      continue
    }
    if (!st.pending || now - st.lastChange < cfg.debounceSeconds * 1000) continue
    if (a.id === 'claude' && [...listed.hooked].some((r) => file.startsWith(r))) { st.pending = false; st.turnStart = null; continue }
    const text = readText(file, !!(a.whole && a.whole(file)))
    const sig = text === null ? '' : a.isDone(text, file)
    if (!sig) continue
    // Chỉ có dòng phụ (vd system turn_duration) ghi thêm sau lời đáp đã báo thì không báo lại
    if (sig === st.doneSig) { st.pending = false; st.turnStart = null; continue }
    st.doneSig = sig
    const durationSec = st.turnStart ? Math.max(0, Math.round((st.mtime - st.turnStart) / 1000)) : null
    st.pending = false; st.turnStart = null
    const rows = parseCached(file, a.parse)
    const last = rows[rows.length - 1] || {}
    emit({ source: a.id, session: path.basename(file, path.extname(file)), project: last.project || '', projectPath: last.projectPath || '', finishedAt: new Date(st.mtime).toISOString(), durationSec })
  }
  seeded = true
}

const sinceId = (since) => ({ events: events.filter((e) => e.id > since), last: seq })

/** Hook Stop của Claude: nguồn chính xác hơn việc đoán qua log. `transcript_path` chỉ tin khi nằm trong thư mục log của một tài khoản. */
function fromHook(payload, now = Date.now()) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const session = typeof p.session_id === 'string' ? p.session_id.slice(0, 80) : ''
  const cwd = typeof p.cwd === 'string' && path.isAbsolute(p.cwd) ? p.cwd.slice(0, 1000) : ''
  if (events.some((e) => e.source === 'claude' && e.session === session && session && now - Date.parse(e.finishedAt) < 3000)) return null
  let durationSec = null
  const tp = typeof p.transcript_path === 'string' ? path.resolve(p.transcript_path) : ''
  if (tp && profiles.dirs().some((d) => tp.startsWith(path.join(d, 'projects') + path.sep))) {
    const text = readText(tp, false)
    if (text) durationSec = turnSeconds(text, now)
  }
  return emit({ source: 'claude', session, project: cwd ? path.basename(cwd) : '', projectPath: cwd, finishedAt: new Date(now).toISOString(), durationSec })
}

/** Số giây từ tin nhắn thật cuối của người dùng (không tính kết quả tool) đến `now`. */
function turnSeconds(tail, now) {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let o
    try { o = JSON.parse(lines[i]) } catch { continue }
    if (o.type !== 'user' || o.isSidechain || !o.timestamp) continue
    const c = o.message && o.message.content
    if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) continue
    const t = Date.parse(o.timestamp)
    return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : null
  }
  return null
}

let timer = null
function start(everyMs = 3000) {
  if (timer) return
  timer = setInterval(() => { try { tick() } catch { /* một nhịp lỗi không làm sập server */ } }, everyMs)
  timer.unref()
}

/** Chỉ cho test. */
function reset() { events.length = 0; seq = 0; state.clear(); listed = { at: 0, files: [], hooked: new Set() }; seeded = false }

module.exports = { tick, start, since: sinceId, fromHook, turnSeconds, reset }
