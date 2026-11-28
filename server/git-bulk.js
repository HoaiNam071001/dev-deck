// Thao tác hàng loạt trên nhiều repo: "Pull tất cả" và "Dọn nhánh đã merge".
// Mỗi thao tác có bước lập kế hoạch (chỉ đọc) và bước chạy; bước chạy kiểm tra lại điều kiện từng repo.
const git = require('./git')
const { run, audit } = require('./git-actions')

const MAX_REPOS = 500
const POOL = 4

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

function checkPaths(paths) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('Chưa chọn repo nào')
  if (paths.length > MAX_REPOS) throw new Error('Quá nhiều repo trong một lần')
  return [...new Set(paths.map((p) => git.knownRepo(String(p))))]
}

/** Lý do repo không được pull tất cả; null nếu đủ điều kiện. Trả thêm behind để hiển thị. */
async function pullBlocker(p) {
  const head = await run(p, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')
  if (!head) return { reason: 'Đang detached HEAD' }
  const up = await run(p, ['rev-parse', '--abbrev-ref', '@{u}']).catch(() => '')
  if (!up) return { reason: 'Nhánh chưa có upstream' }
  if (await run(p, ['status', '--porcelain'])) return { reason: 'Còn thay đổi chưa commit' }
  const [ahead, behind] = (await run(p, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'])).split(/\s+/).map(Number)
  if (ahead > 0) return { reason: `Có ${ahead} commit chưa push (ahead)`, behind }
  if (!behind) return { reason: 'Đã mới nhất', behind: 0, upToDate: true }
  return { reason: null, behind, branch: head }
}

async function pullPlan(paths) {
  const list = checkPaths(paths)
  return pool(list, POOL, async (p) => {
    try { const b = await pullBlocker(p); return { path: p, eligible: !b.reason, ...b } }
    catch (e) { return { path: p, eligible: false, reason: e.message } }
  })
}

async function pullRun(paths) {
  const list = checkPaths(paths)
  return pool(list, POOL, async (p) => {
    let status = 'ok', message = ''
    try {
      const b = await pullBlocker(p)
      if (b.reason) { status = 'skipped'; message = b.reason }
      else message = (await run(p, ['pull', '--ff-only'], 120000)).split('\n').filter(Boolean).pop() || ''
    } catch (e) { status = 'error'; message = e.message }
    if (status !== 'skipped') audit({ repo: p, action: 'pullAll', ok: status === 'ok', error: status === 'error' ? message : undefined })
    return { path: p, status, message }
  })
}

async function defaultBranch(p) {
  const ref = await run(p, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']).catch(() => '')
  if (ref) return ref.replace(/^origin\//, '')
  for (const n of ['main', 'master']) if (await run(p, ['rev-parse', '--verify', '-q', 'refs/heads/' + n]).then(() => true, () => false)) return n
  return null
}

/** Nhánh local đã merge vào nhánh mặc định và an toàn để xóa bằng -d. */
async function mergedBranches(p) {
  const def = await defaultBranch(p)
  if (!def) return { base: null, branches: [], reason: 'Không xác định được nhánh mặc định' }
  const cur = await run(p, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')
  const wt = new Set((await run(p, ['worktree', 'list', '--porcelain']).catch(() => '')).split('\n').filter((l) => l.startsWith('branch refs/heads/')).map((l) => l.slice(18)))
  const defTip = await run(p, ['rev-parse', 'refs/heads/' + def])
  const out = await run(p, ['for-each-ref', '--merged=' + def, '--format=%(refname:short)%00%(objectname)', 'refs/heads'])
  const branches = out.split('\n').filter(Boolean).map((l) => l.split('\0')).filter(([name, sha]) =>
    // Nhánh trùng đầu nhánh mặc định thường là nhánh mới tạo chưa có commit: không coi là "đã merge"
    name !== def && name !== cur && !wt.has(name) && sha !== defTip).map(([name]) => name)
  return { base: def, branches }
}

async function cleanupPlan(paths) {
  const list = checkPaths(paths)
  return pool(list, POOL, async (p) => {
    try { const r = await mergedBranches(p); return { path: p, base: r.base, branches: r.branches, reason: r.reason } }
    catch (e) { return { path: p, base: null, branches: [], reason: e.message } }
  })
}

/** items: [{ path, branches }]; confirmCount phải bằng tổng số nhánh. Chỉ xóa nhánh vẫn nằm trong kết quả "đã merge" lúc chạy, luôn dùng -d. */
async function cleanupRun(items, confirmCount) {
  if (!Array.isArray(items) || !items.length) throw new Error('Chưa chọn nhánh nào')
  const reqs = items.map((it) => ({ path: git.knownRepo(String(it.path)), branches: [...new Set(Array.isArray(it.branches) ? it.branches.map(String) : [])] }))
  const total = reqs.reduce((n, r) => n + r.branches.length, 0)
  if (!total) throw new Error('Chưa chọn nhánh nào')
  if (confirmCount !== total) throw new Error(`Cần gõ đúng số nhánh sẽ xóa (${total})`)
  return pool(reqs, POOL, async ({ path: p, branches }) => {
    const done = [], failed = []
    try {
      const ok = new Set((await mergedBranches(p)).branches)
      for (const b of branches) {
        if (!ok.has(b)) { failed.push({ branch: b, message: 'Không còn đủ điều kiện (chưa merge, đang dùng hoặc đã mất)' }); continue }
        try { await run(p, ['branch', '-d', '--', b]); done.push(b) } catch (e) { failed.push({ branch: b, message: e.message }) }
      }
    } catch (e) { for (const b of branches) failed.push({ branch: b, message: e.message }) }
    audit({ repo: p, action: 'cleanupMerged', params: { branches: done }, ok: !failed.length, error: failed.length ? failed.map((f) => f.branch + ': ' + f.message).join('; ') : undefined })
    return { path: p, done, failed }
  })
}

module.exports = { pullPlan, pullRun, cleanupPlan, cleanupRun }
