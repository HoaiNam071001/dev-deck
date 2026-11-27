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

const SCOPES = new Set(['mine', 'review', 'assigned', 'all'])
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

/** Pipeline (GitLab) / workflow run (GitHub) gần nhất của một project. */
async function pipelines({ account, project }) {
  const proj = String(project || '')
  if (!PROJECT_RE.test(proj)) throw new Error('Tên project không hợp lệ')
  const acc = store.get(String(account || ''))
  return cached(`pl:${acc.id}:${proj}`, 30000, () => providerOf(acc).pipelines(acc, proj))
}

/** Job của một pipeline / run; id chỉ nhận số. */
async function pipelineJobs({ account, project, id }) {
  const proj = String(project || '')
  if (!PROJECT_RE.test(proj) || !/^\d{1,15}$/.test(String(id || ''))) throw new Error('Tham số không hợp lệ')
  const acc = store.get(String(account || ''))
  return cached(`plj:${acc.id}:${proj}:${id}`, 30000, () => providerOf(acc).pipelineJobs(acc, proj, String(id)))
}

const THREAD_RE = /^[\w=+-]{4,120}$/
const ACTIONS = new Set(['resolve', 'unresolve', 'reply', 'retry', 'approve', 'unapprove', 'merge', 'create'])
const BRANCH_RE = /^[\w./-]{1,250}$/
const branchOk = (b) => BRANCH_RE.test(b) && !b.startsWith('-') && !b.includes('..')

/** Thao tác GHI lên remote. Chỉ chạy khi account đã bật "cho phép ghi"; mọi lần gọi (kể cả lỗi) đều ghi data/audit.log. */
async function act(input) {
  const action = String(input.action || '')
  if (!ACTIONS.has(action)) throw new Error('Thao tác không hỗ trợ')
  let acc, params
  if (action === 'retry' || action === 'create') {
    const project = String(input.project || '')
    if (!PROJECT_RE.test(project)) throw new Error('Tên project không hợp lệ')
    acc = store.get(String(input.account || ''))
    if (action === 'retry') {
      if (!/^\d{1,15}$/.test(String(input.id || ''))) throw new Error('Tham số không hợp lệ')
      params = { project, id: String(input.id) }
    } else {
      const source = String(input.source || ''), target = String(input.target || ''), title = String(input.title || '').trim(), description = String(input.description || '')
      if (!branchOk(source) || !branchOk(target)) throw new Error('Tên nhánh không hợp lệ')
      if (source === target) throw new Error('Nhánh nguồn và nhánh đích phải khác nhau')
      if (!title || title.length > 300) throw new Error('Tiêu đề cần 1 đến 300 ký tự')
      if (description.length > 20000) throw new Error('Mô tả quá dài (tối đa 20000 ký tự)')
      params = { project, source, target, title, description }
    }
  } else {
    const key = String(input.key || '')
    acc = store.get(key.split('|')[0])
    params = { key }
    if (action === 'resolve' || action === 'unresolve' || action === 'reply') {
      if (!THREAD_RE.test(String(input.threadId || ''))) throw new Error('Mã thread không hợp lệ')
      params.threadId = String(input.threadId)
    }
    if (action === 'reply') {
      const body = String(input.body || '').trim()
      if (!body) throw new Error('Cần nhập nội dung trả lời')
      if (body.length > 20000) throw new Error('Nội dung quá dài (tối đa 20000 ký tự)')
      params.body = body
    }
  }
  if (!acc.write) throw new Error('Account này đang ở chế độ chỉ đọc. Bật "cho phép ghi" ở panel trái trước.')
  const p = providerOf(acc)
  let error, result = {}
  try {
    if (action === 'retry') await p.retryPipeline(acc, params.project, params.id)
    else if (action === 'create') result = await p.createChangeRequest(acc, params.project, params)
    else {
      const ref = p.parseKey(params.key)
      if (action === 'reply') await p.replyThread(acc, ref, params.threadId, params.body)
      else if (action === 'resolve' || action === 'unresolve') await p.resolveThread(acc, ref, params.threadId, action === 'resolve')
      else if (action === 'approve' || action === 'unapprove') await p.approve(acc, ref, action === 'approve')
      else await p.merge(acc, ref)
    }
  } catch (e) { error = e }
  const logged = { ...params, body: params.body ? `(${params.body.length} ký tự)` : undefined, description: params.description ? `(${params.description.length} ký tự)` : undefined, url: result.url || undefined }
  require('../git-actions').audit({ repo: 'remote:' + acc.name, action: 'remote.' + action, params: logged, ok: !error, error: error?.message })
  if (error) throw error
  for (const pre of [`gl:${acc.id}:`, `pl:${acc.id}:`, `plj:${acc.id}:`, `br:${acc.id}:`, `repo:${acc.id}:`]) dropCache(pre)
  return { ok: true, url: result.url || null, number: result.number ?? null }
}

/** Job đang chạy ở máy này (tab Job) thuộc bản clone local của project và đang ở nhánh `branch`, để đối chiếu với CI. */
async function localJobs({ account, project, branch }) {
  const proj = String(project || '')
  const br = String(branch || '')
  if (!PROJECT_RE.test(proj) || !branchOk(br)) throw new Error('Tham số không hợp lệ')
  const acc = store.get(String(account || ''))
  let local = null
  try {
    const git = require('../git')
    for (const r of await git.remoteUrlMap()) {
      if (r.urls.some((u) => { const x = parseRemoteUrl(u); return x && projectOn(acc, x) === proj })) { local = { path: r.path, name: r.name }; break }
    }
  } catch { /* không đọc được repo local */ }
  if (!local) return { local: null, jobs: [] }
  const scan = await require('../jobs').scan().catch(() => ({ jobs: [] }))
  const norm = (x) => String(x || '').replace(/[\\/]+$/, '').toLowerCase()
  const jobs = (scan.jobs || []).filter((j) => norm(j.repo) === norm(local.path) && j.branch === br)
    .map((j) => ({ pid: j.pid, name: j.name, kind: j.kind, cmd: String(j.cmd || '').slice(0, 200), start: j.start, progress: j.progress ? { total: j.progress.total, done: j.progress.done, pass: j.progress.pass, fail: j.progress.fail, finished: j.progress.finished } : null }))
  return { local, jobs }
}

async function changeRequest(key) {
  const accountId = String(key || '').split('|')[0]
  const acc = store.get(accountId)
  const p = providerOf(acc)
  return p.detail(acc, p.parseKey(key))
}

module.exports = { accounts, addAccount, testAccount, listChangeRequests, forBranch, branches, pipelines, pipelineJobs, changeRequest, act, localJobs, setWrite: (id, on) => store.setWrite(id, on), removeAccount: (id) => { dropCache(`gl:${id}:`); return store.remove(id) }, setCrypto: store.setCrypto }
