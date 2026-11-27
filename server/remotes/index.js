// Remotes: gom MR / PR từ nhiều account (GitLab, GitHub) về một dạng chung. Giai đoạn 9: chỉ đọc.
const store = require('./store')
const { parseRemoteUrl, projectOn } = require('./match')
const { cleanBase, dropCache, cached } = require('./http')

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

const PROJECT_RE = /^[\w.-]+(\/[\w.-]+)+$/

/** Nhánh của một project trên remote, kèm MR / PR theo nhánh nguồn và bản clone local (nếu máy có). */
async function branches({ account, project }) {
  const proj = String(project || '')
  if (!PROJECT_RE.test(proj)) throw new Error('Tên project không hợp lệ')
  const acc = store.get(String(account || ''))
  const p = providerOf(acc)
  const [info, crs] = await Promise.all([
    cached(`br:${acc.id}:${proj}`, 60000, () => p.branches(acc, proj)),
    cached(`repo:${acc.id}:${proj}`, 60000, () => p.byProject(acc, proj)).catch(() => null),
  ])
  // Bản clone local: repo đã quét có remote trỏ tới đúng project này trên account này
  let local = null
  try {
    const git = require('../git')
    for (const r of await git.remoteUrlMap()) {
      if (r.urls.some((u) => { const x = parseRemoteUrl(u); return x && projectOn(acc, x) === proj })) {
        local = { path: r.path, name: r.name, branches: await git.localBranchNames(r.path) }
        break
      }
    }
  } catch { /* không đọc được repo local: bỏ qua cột local */ }
  return { ...info, crs: crs ?? [], crsError: crs === null, local }
}

/** MR / PR của một nhánh local: thử từng remote URL với các account cùng host. Lỗi một account bị bỏ qua. */
async function forBranch({ remotes, branch }) {
  const br = String(branch || '')
  if (!br || br.length > 250 || br.startsWith('-')) return []
  const seen = new Set()
  const jobs = []
  for (const url of (remotes || []).slice(0, 5)) {
    const r = parseRemoteUrl(url)
    if (!r) continue
    for (const pub of store.list()) {
      const acc = store.get(pub.id)
      const project = projectOn(acc, r)
      const k = pub.id + '|' + project
      if (!project || seen.has(k)) continue
      seen.add(k)
      jobs.push(providerOf(acc).byBranch(acc, project, br).catch(() => []))
    }
  }
  const items = (await Promise.all(jobs)).flat()
  const rank = (c) => (c.state === 'opened' ? 0 : 1)
  return items.sort((a, b) => rank(a) - rank(b) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

async function changeRequest(key) {
  const accountId = String(key || '').split('|')[0]
  const acc = store.get(accountId)
  const p = providerOf(acc)
  return p.detail(acc, p.parseKey(key))
}

module.exports = { accounts, addAccount, testAccount, listChangeRequests, forBranch, branches, changeRequest, removeAccount: (id) => { dropCache(`gl:${id}:`); return store.remove(id) }, setCrypto: store.setCrypto }
