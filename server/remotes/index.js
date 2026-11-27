// Remotes: gom MR / PR từ nhiều account (GitLab, GitHub) về một dạng chung. Giai đoạn 9: chỉ đọc.
const store = require('./store')
const { cleanBase, dropCache } = require('./http')

const PROVIDERS = { gitlab: require('./gitlab'), github: require('./github') }
const providerOf = (acc) => PROVIDERS[acc.provider] || (() => { throw new Error('Provider chưa hỗ trợ: ' + acc.provider) })()

const accounts = () => store.list()

/** Thêm account: kiểm tra token trước, lưu username để lọc "của tôi". */
async function addAccount(input) {
  const provider = String(input.provider || '')
  if (!PROVIDERS[provider]) throw new Error('Provider không hỗ trợ')
  const token = String(input.token || '').trim()
  if (!token) throw new Error('Thiếu token')
  const baseUrl = provider === 'github' && !String(input.baseUrl || '').trim() ? 'https://github.com' : cleanBase(input.baseUrl)
  const name = String(input.name || '').trim() || (provider === 'gitlab' ? 'GitLab · ' : 'GitHub · ') + new URL(baseUrl).host
  const { user } = await PROVIDERS[provider].whoami({ provider, baseUrl, token, id: 'new' })
  return store.add({ provider, name, baseUrl, token, user })
}

/** Thử lại kết nối của account đã lưu. */
async function testAccount(id) {
  const acc = store.get(id)
  const { user } = await providerOf(acc).whoami(acc)
  return { ok: true, user }
}

const SCOPES = new Set(['mine', 'review', 'assigned'])
const STATES = new Set(['opened', 'merged', 'closed'])

/** MR / PR của các account (hoặc một account) theo phạm vi và trạng thái. Lỗi của một account không làm hỏng account khác. */
async function listChangeRequests({ account, scope, state }) {
  const all = store.list()
  const picked = account && account !== 'all' ? all.filter((a) => a.id === account) : all
  const sc = SCOPES.has(scope) ? scope : 'mine'
  const st = STATES.has(state) ? state : 'opened'
  const errors = []
  const parts = await Promise.all(picked.map(async (pub) => {
    try { const acc = store.get(pub.id); return await providerOf(acc).list(acc, { scope: sc, state: st }) }
    catch (e) { errors.push({ accountId: pub.id, name: pub.name, error: e.message }); return [] }
  }))
  const items = parts.flat().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return { items, errors, fetchedAt: new Date().toISOString() }
}

async function changeRequest(key) {
  const accountId = String(key || '').split('|')[0]
  const acc = store.get(accountId)
  const p = providerOf(acc)
  return p.detail(acc, p.parseKey(key))
}

module.exports = { accounts, addAccount, testAccount, listChangeRequests, changeRequest, removeAccount: (id) => { dropCache(`gl:${id}:`); return store.remove(id) }, setCrypto: store.setCrypto }
