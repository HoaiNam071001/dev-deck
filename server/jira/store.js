// Account Jira ở data/jira.json. Dùng lại cách mã hóa token của Remotes; token không bao giờ trả về giao diện.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { seal, unseal } = require('../remotes/store')

const FILE = path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data'), 'jira.json')

function readAll() {
  try { const a = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(a?.accounts) ? a.accounts : [] } catch { return [] }
}
function writeAll(accounts) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify({ accounts }, null, 2))
}
const pub = (a) => ({ id: a.id, name: a.name, baseUrl: a.baseUrl, kind: a.kind, email: a.email || '', user: a.user || '', tokenHint: a.hint || '', write: !!a.write })

const list = () => readAll().map(pub)
function get(id) {
  const a = readAll().find((x) => x.id === id)
  if (!a) throw new Error('Không có account Jira này')
  return { ...a, token: unseal(a.token) }
}
function add({ name, baseUrl, kind, email, token, user }) {
  const a = { id: crypto.randomUUID(), name, baseUrl, kind, email: email || '', user: user || '', hint: token.slice(-4), token: seal(token) }
  writeAll([...readAll(), a])
  return pub(a)
}
function remove(id) { writeAll(readAll().filter((a) => a.id !== id)); return list() }

module.exports = { list, get, add, remove }
