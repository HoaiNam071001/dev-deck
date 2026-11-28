const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const profiles = require('./profiles')

const DATA = () => process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data')
const TOKEN_FILE = () => path.join(DATA(), 'ai-hook-token')
const MARK = '/api/ai/hook/stop'

function token() {
  try { const t = fs.readFileSync(TOKEN_FILE(), 'utf8').trim(); if (/^[0-9a-f]{64}$/.test(t)) return t } catch { /* tạo mới */ }
  const t = crypto.randomBytes(32).toString('hex')
  fs.mkdirSync(DATA(), { recursive: true })
  fs.writeFileSync(TOKEN_FILE(), t, { mode: 0o600 })
  return t
}

const tokenOk = (given) => {
  let want
  try { want = Buffer.from(fs.readFileSync(TOKEN_FILE(), 'utf8').trim()) } catch { return false }
  const got = Buffer.from(String(given || ''))
  return want.length > 0 && want.length === got.length && crypto.timingSafeEqual(want, got)
}

const command = (port) => `curl -s -m 3 -X POST -H "content-type: application/json" -H "x-devdeck-token: ${token()}" --data-binary @- http://127.0.0.1:${Number(port)}${MARK} >/dev/null 2>&1 || true`

function readSettings(file) {
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch (e) { if (e.code === 'ENOENT') return {}; throw e }
  if (!text.trim()) return {}
  try { const o = JSON.parse(text); if (o && typeof o === 'object' && !Array.isArray(o)) return o } catch { /* báo lỗi bên dưới */ }
  throw new Error('settings.json không phải JSON hợp lệ, DevDeck không tự sửa: ' + file)
}

const isOurs = (h) => h && typeof h.command === 'string' && h.command.includes(MARK)
const groupsOf = (s) => (s.hooks && Array.isArray(s.hooks.Stop) ? s.hooks.Stop : [])
const portOf = (s) => { for (const g of groupsOf(s)) for (const h of (g && g.hooks) || []) if (isOurs(h)) { const m = /127\.0\.0\.1:(\d+)/.exec(h.command); return m ? Number(m[1]) : 0 } return null }

const installedIn = (file) => { try { return portOf(readSettings(file)) !== null } catch { return false } }

function write(file, s) {
  const bak = file + '.devdeck-bak'
  if (fs.existsSync(file) && !fs.existsSync(bak)) fs.copyFileSync(file, bak) // sao lưu một lần, giữ bản gốc của người dùng
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.devdeck-tmp'
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

/** Thêm (thay nếu đã có) hook Stop của DevDeck, giữ nguyên mọi hook khác của người dùng. */
function install(dir, port) {
  const file = path.join(dir, 'settings.json')
  const s = readSettings(file)
  uninstallFrom(s)
  s.hooks = s.hooks && typeof s.hooks === 'object' ? s.hooks : {}
  s.hooks.Stop = [...groupsOf(s), { hooks: [{ type: 'command', command: command(port) }] }]
  write(file, s)
}

function uninstallFrom(s) {
  if (!s.hooks || !Array.isArray(s.hooks.Stop)) return
  s.hooks.Stop = s.hooks.Stop
    .map((g) => (g && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !isOurs(h)) } : g))
    .filter((g) => !(g && Array.isArray(g.hooks) && g.hooks.length === 0))
  if (!s.hooks.Stop.length) delete s.hooks.Stop
  if (!Object.keys(s.hooks).length) delete s.hooks
}

function uninstall(dir) {
  const file = path.join(dir, 'settings.json')
  if (!fs.existsSync(file)) return
  const s = readSettings(file)
  if (portOf(s) === null) return
  uninstallFrom(s)
  write(file, s)
}

/** Trạng thái từng tài khoản; `port` lệch cổng server hiện tại nghĩa là cần cài lại. */
function status(currentPort) {
  return profiles.dirs().map((d) => {
    const file = path.join(d, 'settings.json')
    let port = null, error = ''
    try { port = portOf(readSettings(file)) } catch (e) { error = e.message }
    return { dir: d === profiles.DEFAULT_DIR ? '' : d, path: d, installed: port !== null, stale: port !== null && port !== currentPort, error }
  })
}

module.exports = { install, uninstall, status, installedIn, tokenOk, MARK }
