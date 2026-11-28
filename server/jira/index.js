// Jira (13a, chỉ đọc): account, nhận mã ticket, lấy ticket hàng loạt, việc của tôi. Cache 60 giây.
const store = require('./store')
const client = require('./client')
const { cleanBase, cached } = require('../remotes/http')

const accounts = () => store.list()

async function addAccount(input) {
  const token = String(input.token || '').trim()
  if (!token) throw new Error('Thiếu token')
  const baseUrl = cleanBase(input.baseUrl)
  const kind = input.kind === 'server' || input.kind === 'cloud' ? input.kind : (new URL(baseUrl).host.endsWith('.atlassian.net') ? 'cloud' : 'server')
  const email = String(input.email || '').trim()
  if (kind === 'cloud' && !email) throw new Error('Jira Cloud cần email')
  const name = String(input.name || '').trim() || 'Jira · ' + new URL(baseUrl).host
  const { user } = await client.whoami({ baseUrl, kind, email, token })
  return store.add({ name, baseUrl, kind, email, token, user })
}
const removeAccount = (id) => store.remove(id)
async function testAccount(id) { return { ok: true, ...(await client.whoami(store.get(id))) } }

const keysOf = (acc) => cached(`jira:keys:${acc.id}`, 600000, async () => new Set(await client.projectKeys(acc)))

/** Ticket cho một danh sách mã (≤ 50): thử từng account, mã nào account nào có thì lấy. Lỗi một account bị bỏ qua. */
async function issues({ keys }) {
  const wanted = [...new Set((keys || []).map(String).filter((k) => /^[A-Z][A-Z0-9]+-\d+$/.test(k)))].slice(0, 50)
  if (!wanted.length) return []
  const found = new Map()
  for (const pub of store.list()) {
    const left = wanted.filter((k) => !found.has(k))
    if (!left.length) break
    try {
      const acc = store.get(pub.id)
      const projects = await keysOf(acc)
      const mine = left.filter((k) => projects.has(k.slice(0, k.lastIndexOf('-'))))
      if (!mine.length) continue
      const list = await cached(`jira:is:${acc.id}:${mine.join(',')}`, 60000, () => client.search(acc, `key in (${mine.join(',')})`))
      for (const i of list) found.set(i.key, { ...i, accountId: acc.id })
    } catch { /* account lỗi: bỏ qua */ }
  }
  return wanted.filter((k) => found.has(k)).map((k) => found.get(k))
}

/** Mã ticket trong các đoạn chữ (tên nhánh, tiêu đề MR…), chỉ giữ project key có thật ở ít nhất một account. */
async function extract({ texts }) {
  const sets = []
  for (const pub of store.list()) { try { sets.push(await keysOf(store.get(pub.id))) } catch { /* bỏ qua */ } }
  const has = { has: (p) => sets.some((s) => s.has(p)) }
  return (texts || []).slice(0, 200).map((t) => client.extractKeys(String(t).slice(0, 2000), sets.length ? has : null))
}

/** Việc của tôi: ticket giao cho tôi, chưa Done. */
async function mine() {
  const errors = []
  const parts = await Promise.all(store.list().map(async (pub) => {
    try {
      const acc = store.get(pub.id)
      const list = await cached(`jira:mine:${acc.id}`, 60000, () => client.search(acc, 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'))
      return list.map((i) => ({ ...i, accountId: acc.id }))
    } catch (e) { errors.push({ accountId: pub.id, name: pub.name, error: e.message }); return [] }
  }))
  return { items: parts.flat(), errors }
}

const watch = require('./watch')

/** Ticket lấy theo account, không lọc theo project key của ai; dùng cho ghim (mã đã hợp lệ). */
const byKeys = (keys) => issues({ keys })

/** Có gì mới: ticket của tôi + ticket đã ghim, kèm sự kiện đổi kể từ lần xem cuối. */
async function whatsNew() {
  const m = await mine()
  const pins = watch.pinned()
  const have = new Set(m.items.map((i) => i.key))
  const extra = await byKeys(pins.filter((k) => !have.has(k)))
  const items = [...m.items, ...extra].slice(0, 50)
  const ev = new Map(watch.compare(items).map((e) => [e.key, e.events]))
  return {
    items: items.map((i) => ({ issue: i, pinned: pins.includes(i.key), events: ev.get(i.key) || [] })),
    errors: m.errors,
  }
}

/** Đánh dấu đã xem một ticket (key) hoặc tất cả (không key). */
async function seen({ key }) {
  const wn = await whatsNew()
  watch.markSeen(wn.items.map((x) => x.issue).filter((i) => !key || i.key === key))
  return { ok: true }
}

const pin = ({ key, on }) => ({ pinned: watch.pin(String(key || ''), on === true) })

module.exports = { whatsNew, seen, pin, accounts, addAccount, removeAccount, testAccount, issues, extract, mine }
