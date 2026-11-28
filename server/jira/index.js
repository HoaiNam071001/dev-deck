// Jira: account, lấy ticket hàng loạt, việc của tôi / ghim / theo dõi, ghi (chuyển trạng thái, comment, giờ). Cache 60 giây.
const store = require('./store')
const client = require('./client')
const { cleanBase, cached, dropCache, pool } = require('../remotes/http')

const accounts = () => store.list()
const setWrite = (id, on) => store.setWrite(String(id || ''), on === true)

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

/** Có gì mới: ticket của tôi + đã ghim + nhóm đang theo dõi (theo người / JQL), kèm sự kiện đổi kể từ lần xem cuối. */
async function whatsNew() {
  const m = await mine()
  const errors = [...m.errors]
  const pins = watch.pinned()
  const follows = watch.follows()
  const have = new Set(m.items.map((i) => i.key))
  const extra = await byKeys(pins.filter((k) => !have.has(k)))
  const items = [...m.items, ...extra].slice(0, 50)
  const via = new Map()
  for (const f of follows) {
    try {
      const acc = store.get(f.account)
      const list = await cached(`jira:follow:${f.id}`, 60000, () => client.search(acc, f.jql, 30))
      for (const i of list) {
        if (!via.has(i.key)) via.set(i.key, [])
        via.get(i.key).push(f.label)
        if (!items.some((x) => x.key === i.key)) items.push({ ...i, accountId: acc.id })
      }
    } catch (e) { errors.push({ accountId: f.account, name: 'Theo dõi “' + f.label + '”', error: e.message }) }
  }
  const capped = items.slice(0, 150)
  const ev = new Map(watch.compare(capped).map((e) => [e.key, e.events]))
  return {
    items: capped.map((i) => ({ issue: i, pinned: pins.includes(i.key), via: via.get(i.key) || [], events: ev.get(i.key) || [] })),
    follows: follows.map((f) => ({ id: f.id, label: f.label, jql: f.jql, account: f.account })),
    errors,
  }
}

async function users({ account, q }) {
  const text = String(q || '').trim()
  if (text.length < 2) return []
  return client.findUsers(store.get(String(account || '')), text.slice(0, 80))
}

/** Thêm nhóm theo dõi: `userId` (theo người) hoặc `jql` tự viết. */
function follow(input) {
  if (input.action === 'remove') { dropCache('jira:follow:'); return { follows: watch.removeFollow(String(input.id || '')) } }
  const acc = store.get(String(input.account || ''))
  const jql = input.userId ? client.jqlOfUser(acc, input.userId) : String(input.jql || '')
  const label = input.userId ? String(input.label || input.userId) : String(input.label || jql)
  return { follow: watch.addFollow({ account: acc.id, label, jql }) }
}

/** Đánh dấu đã xem một ticket (key) hoặc tất cả (không key). */
async function seen({ key }) {
  const wn = await whatsNew()
  watch.markSeen(wn.items.map((x) => x.issue).filter((i) => !key || i.key === key))
  return { ok: true }
}

/** Nhánh local của các repo đã quét có chứa mã ticket; `suggested` = repo có nhánh cùng project key (gợi ý nơi tạo nhánh). */
async function links({ key }) {
  const k = String(key || '')
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(k)) throw new Error('Mã ticket không hợp lệ')
  const project = k.slice(0, k.lastIndexOf('-'))
  const git = require('../git')
  const has = new RegExp(`(^|[^A-Za-z0-9])${k}(?!\\d)`, 'i')
  const same = new RegExp(`(^|[^A-Za-z0-9])${project}-\\d+`, 'i')
  const out = await pool(await git.remoteUrlMap(), 8, async (r) => {
    try {
      const names = await git.localBranchNames(r.path)
      return { path: r.path, name: r.name, branches: names.filter((n) => has.test(n)), suggested: names.some((n) => same.test(n)) }
    } catch { return null } // repo lỗi: bỏ qua
  })
  return out.filter((r) => r && (r.branches.length || r.suggested))
}

const KEY_OK = /^[A-Z][A-Z0-9]+-\d+$/
const accountFor = async (key, accountId) => {
  if (!KEY_OK.test(key)) throw new Error('Mã ticket không hợp lệ')
  const acc = store.get(String(accountId || ''))
  if (!(await keysOf(acc)).has(key.slice(0, key.lastIndexOf('-')))) throw new Error('Ticket không thuộc account này')
  return acc
}

/** Các bước chuyển trạng thái có thể làm (chỉ đọc; workflow mỗi project khác nhau nên luôn hỏi Jira). */
async function transitionsOf({ key, account }) { return client.transitions(await accountFor(String(key || ''), account), String(key)) }

/** Thao tác ghi lên Jira: transition | comment | worklog. Account phải bật ghi; ghi audit (không ghi nội dung, chỉ độ dài). */
async function act(input) {
  const action = String(input.action || '')
  if (!['transition', 'comment', 'worklog'].includes(action)) throw new Error('Hành động không hỗ trợ')
  const key = String(input.key || '')
  const acc = await accountFor(key, input.account)
  if (!acc.write) throw new Error('Account Jira này đang ở chế độ chỉ đọc. Bật "cho phép ghi" ở trang Jira trước.')
  const params = { key }
  let run
  if (action === 'transition') {
    const id = String(input.transitionId || '')
    if (!/^\d{1,10}$/.test(id)) throw new Error('Mã bước chuyển không hợp lệ')
    params.transitionId = id
    run = () => client.transition(acc, key, id)
  } else if (action === 'comment') {
    const body = String(input.body || '').trim()
    if (!body) throw new Error('Cần nhập nội dung comment')
    if (body.length > 20000) throw new Error('Nội dung quá dài (tối đa 20000 ký tự)')
    params.body = `(${body.length} ký tự)`
    run = () => client.comment(acc, key, body)
  } else {
    const seconds = Math.round(Number(input.seconds))
    if (!Number.isFinite(seconds) || seconds < 60 || seconds > 86400) throw new Error('Thời gian phải từ 1 phút đến 24 giờ')
    const note = String(input.body || '').trim().slice(0, 5000)
    params.seconds = seconds
    if (note) params.body = `(${note.length} ký tự)`
    run = () => client.worklog(acc, key, seconds, note)
  }
  let error
  try { await run() } catch (e) { error = e }
  require('../git-actions').audit({ repo: 'jira:' + acc.name, action: 'jira.' + action, params, ok: !error, error: error?.message })
  if (error) throw error
  dropCache(`jira:`)
  return { ok: true }
}

const pin = ({ key, on }) => ({ pinned: watch.pin(String(key || ''), on === true) })

module.exports = { users, follow, transitionsOf, act, setWrite, links, whatsNew, seen, pin, accounts, addAccount, removeAccount, testAccount, issues }
