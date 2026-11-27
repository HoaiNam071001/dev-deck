// Lưu account remote (GitLab / GitHub) ở data/remotes.json. Token được mã hóa bằng safeStorage của Electron
// khi chạy trong app desktop (main.cjs gọi setCrypto); chạy server riêng (npm start) thì chỉ che bằng base64.
// Token không bao giờ được trả về cho giao diện, chỉ trả phần gợi ý (4 ký tự cuối).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const FILE = path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data'), 'remotes.json')

let backend = null
/** { encrypt(text) -> Buffer, decrypt(Buffer) -> text } từ safeStorage; null = không mã hóa được. */
function setCrypto(b) { backend = b }

const seal = (t) => backend ? 'enc:' + backend.encrypt(t).toString('base64') : 'b64:' + Buffer.from(t, 'utf8').toString('base64')
function unseal(s) {
  const [kind, data] = [String(s).slice(0, 3), String(s).slice(4)]
  if (kind === 'enc') { if (!backend) throw new Error('Không giải mã được token (thiếu safeStorage)'); return backend.decrypt(Buffer.from(data, 'base64')) }
  return Buffer.from(data, 'base64').toString('utf8')
}

function readAll() {
  try { const a = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(a?.accounts) ? a.accounts : [] } catch { return [] }
}
function writeAll(accounts) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify({ accounts }, null, 2))
}

const pub = (a) => ({ id: a.id, provider: a.provider, name: a.name, baseUrl: a.baseUrl, user: a.user || '', tokenHint: a.hint || '', write: !!a.write })

/** Danh sách account cho giao diện (không có token). */
const list = () => readAll().map(pub)

/** Account kèm token thật, chỉ dùng trong server. */
function get(id) {
  const a = readAll().find((x) => x.id === id)
  if (!a) throw new Error('Không có account này')
  return { ...a, token: unseal(a.token) }
}

function add({ provider, name, baseUrl, token, user }) {
  const a = { id: crypto.randomUUID(), provider, name, baseUrl, user: user || '', hint: token.slice(-4), token: seal(token) }
  writeAll([...readAll(), a])
  return pub(a)
}
/** Bật / tắt thao tác ghi (resolve, trả lời, chạy lại pipeline) cho account. Mặc định tắt. */
function setWrite(id, on) {
  const all = readAll()
  const a = all.find((x) => x.id === id)
  if (!a) throw new Error('Không có account này')
  a.write = !!on
  writeAll(all)
  return pub(a)
}
function remove(id) { writeAll(readAll().filter((a) => a.id !== id)); return list() }

module.exports = { setCrypto, list, get, add, remove, setWrite }
