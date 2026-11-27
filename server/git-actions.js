// Các lệnh git GHI. Mỗi hành động là một hàm, tham số được kiểm tra trước khi chạy.
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

const AUDIT = path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', 'data'), 'audit.log')

function run(cwd, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=off', ...args], {
      cwd, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message).trim() || 'Lệnh git thất bại'))
      resolve((stdout + stderr).trim())
    })
  })
}

async function checkBranchName(cwd, name) {
  if (typeof name !== 'string' || !name || name.startsWith('-')) throw new Error('Tên nhánh không hợp lệ')
  await run(cwd, ['check-ref-format', '--branch', name]).catch(() => { throw new Error('Tên nhánh không hợp lệ: ' + name) })
  return name
}

function checkPaths(paths) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('Chưa chọn tệp nào')
  for (const p of paths) {
    if (typeof p !== 'string' || !p || path.isAbsolute(p) || p.split(/[\/]/).includes('..')) throw new Error('Đường dẫn tệp không hợp lệ: ' + p)
  }
  return paths
}

const hasCommits = (cwd) => run(cwd, ['rev-parse', '--verify', '-q', 'HEAD']).then(() => true, () => false)
const refExists = (cwd, ref) => run(cwd, ['rev-parse', '--verify', '-q', ref]).then(() => true, () => false)

/** Nhánh mặc định: theo origin/HEAD, không có thì main / master. */
async function defaultBranch(cwd) {
  const ref = await run(cwd, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']).catch(() => '')
  if (ref) return ref.replace(/^origin\//, '')
  for (const n of ['main', 'master']) if (await refExists(cwd, 'refs/heads/' + n)) return n
  return null
}
const currentBranch = (cwd) => run(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')

/** Có thay đổi trên tệp đã theo dõi (đã stage hoặc đã sửa) thì chuyển nhánh dễ mất việc. */
async function assertClean(cwd, what) {
  const out = await run(cwd, ['status', '--porcelain', '--untracked-files=no'])
  if (out) {
    const n = out.split('\n').filter(Boolean).length
    throw new Error(`Working tree còn ${n} tệp thay đổi chưa commit. Commit hoặc stash trước khi ${what}.`)
  }
}

/** "origin/feat/x" thành { remote: 'origin', branch: 'feat/x' } theo danh sách remote thật của repo. */
async function splitRemoteRef(cwd, ref) {
  const remotes = (await run(cwd, ['remote'])).split('\n').filter(Boolean).sort((a, b) => b.length - a.length)
  const remote = typeof ref === 'string' ? remotes.find((r) => ref.startsWith(r + '/')) : undefined
  if (!remote) throw new Error('Không xác định được remote của nhánh: ' + ref)
  return { remote, branch: await checkBranchName(cwd, ref.slice(remote.length + 1)) }
}

const needName = (body, name) => { if (body.confirmName !== name) throw new Error('Cần gõ đúng tên nhánh để xác nhận') }

const actions = {
  async checkout(cwd, { branch, remote }) {
    await checkBranchName(cwd, branch)
    await assertClean(cwd, 'chuyển nhánh')
    if (remote) {
      // "origin/feat" → tạo nhánh local "feat" theo dõi remote
      const local = branch.slice(branch.indexOf('/') + 1)
      const exists = await run(cwd, ['rev-parse', '--verify', '-q', 'refs/heads/' + local]).then(() => true, () => false)
      return run(cwd, exists ? ['switch', local] : ['switch', '--track', branch])
    }
    return run(cwd, ['switch', branch])
  },
  async createBranch(cwd, { name, from, checkout = true }) {
    await checkBranchName(cwd, name)
    if (await refExists(cwd, 'refs/heads/' + name)) throw new Error('Nhánh đã tồn tại: ' + name)
    const start = []
    if (from !== undefined && from !== '') {
      if (typeof from !== 'string' || from.startsWith('-') || !(await refExists(cwd, from + '^{commit}'))) throw new Error('Điểm bắt đầu không hợp lệ: ' + from)
      start.push(from)
    }
    return run(cwd, checkout ? ['switch', '-c', name, ...start] : ['branch', name, ...start])
  },
  async renameBranch(cwd, { from, to }) {
    await checkBranchName(cwd, from); await checkBranchName(cwd, to)
    if (!(await refExists(cwd, 'refs/heads/' + from))) throw new Error('Không có nhánh local: ' + from)
    if (await refExists(cwd, 'refs/heads/' + to)) throw new Error('Đã có nhánh tên ' + to)
    await run(cwd, ['branch', '-m', from, to])
    const up = await run(cwd, ['config', `branch.${to}.remote`]).catch(() => '')
    return up ? `Đã đổi tên ${from} → ${to}. Nhánh trên remote ${up} vẫn tên cũ (đẩy nhánh mới rồi xóa nhánh cũ nếu cần).` : `Đã đổi tên ${from} → ${to}`
  },
  /** Xóa nhánh local. -d (an toàn) trước; -D chỉ khi force. dryRun trả về thông tin để UI cảnh báo. */
  async deleteBranch(cwd, body) {
    const { branch, force } = body
    await checkBranchName(cwd, branch)
    if (!(await refExists(cwd, 'refs/heads/' + branch))) throw new Error('Không có nhánh local: ' + branch)
    if ((await currentBranch(cwd)) === branch) throw new Error('Không xóa được nhánh đang mở. Chuyển sang nhánh khác trước.')
    const def = await defaultBranch(cwd)
    if (def === branch) throw new Error('Không xóa nhánh mặc định: ' + branch)
    const unmerged = Number(await run(cwd, ['rev-list', '--count', 'HEAD..refs/heads/' + branch]).catch(() => '0')) || 0
    const upstream = await run(cwd, ['rev-parse', '--abbrev-ref', branch + '@{u}']).catch(() => '')
    if (body.dryRun) return { output: unmerged ? `${unmerged} commit chưa có trong nhánh hiện tại` : 'Đã merge vào nhánh hiện tại', info: { branch, merged: unmerged === 0, unmerged, upstream: upstream || null } }
    needName(body, branch)
    return run(cwd, ['branch', force === true ? '-D' : '-d', '--', branch])
  },
  /** Xóa nhánh trên remote (git push --delete). Không động tới nhánh mặc định. */
  async deleteRemoteBranch(cwd, body) {
    const { remote, branch } = await splitRemoteRef(cwd, body.ref)
    const def = await defaultBranch(cwd)
    if (def === branch) throw new Error('Không xóa nhánh mặc định trên remote: ' + branch)
    if (body.dryRun) return { output: `Sẽ xóa ${branch} trên ${remote}`, info: { remote, branch } }
    needName(body, branch)
    return run(cwd, ['push', remote, '--delete', branch], 120000)
  },
  async stage(cwd, { paths, all }) {
    return run(cwd, all ? ['add', '-A'] : ['add', '--', ...checkPaths(paths)])
  },
  async unstage(cwd, { paths, all }) {
    const list = all ? ['.'] : checkPaths(paths)
    return run(cwd, (await hasCommits(cwd)) ? ['restore', '--staged', '--', ...list] : ['rm', '--cached', '-r', '-q', '--', ...list])
  },
  async commit(cwd, { message, amend }) {
    const msg = typeof message === 'string' ? message.trim() : ''
    if (!msg && !amend) throw new Error('Cần nhập nội dung commit')
    const args = ['commit']
    if (amend) args.push('--amend')
    if (msg) args.push('-m', msg); else args.push('--no-edit')
    return run(cwd, args)
  },
  // Pull/push một nhánh local bất kỳ (không cần checkout). Nhánh hiện tại dùng pull/push thường.
  async pullBranch(cwd, { branch }) {
    await checkBranchName(cwd, branch)
    const cur = await run(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')
    if (cur === branch) return actions.pull(cwd)
    const remote = await run(cwd, ['config', `branch.${branch}.remote`]).catch(() => '')
    const merge = await run(cwd, ['config', `branch.${branch}.merge`]).catch(() => '')
    if (!remote || !merge) throw new Error(`Nhánh ${branch} chưa có upstream`)
    // Không có dấu "+": git từ chối nếu không phải fast-forward
    return run(cwd, ['fetch', remote, `${merge}:refs/heads/${branch}`], 120000)
  },
  async pushBranch(cwd, { branch }) {
    await checkBranchName(cwd, branch)
    const remote = await run(cwd, ['config', `branch.${branch}.remote`]).catch(() => '')
    if (!remote) return run(cwd, ['push', '-u', 'origin', `refs/heads/${branch}:refs/heads/${branch}`], 120000)
    const merge = await run(cwd, ['config', `branch.${branch}.merge`]).catch(() => '') || `refs/heads/${branch}`
    return run(cwd, ['push', remote, `refs/heads/${branch}:${merge}`], 120000)
  },
  fetch: (cwd) => run(cwd, ['fetch', '--all', '--prune'], 120000),
  pull: (cwd) => run(cwd, ['pull', '--ff-only'], 120000),
  async push(cwd) {
    const up = await run(cwd, ['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null)
    return run(cwd, up ? ['push'] : ['push', '-u', 'origin', 'HEAD'], 120000)
  },
}

/** Ghi một dòng nhật ký thao tác (data/audit.log). */
function audit(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT), { recursive: true })
    fs.appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
  } catch { /* không để lỗi ghi log làm hỏng hành động */ }
}

/** Hành động có chế độ dryRun (chỉ đọc, trả về điều sẽ xảy ra). */
const DRY_RUN = new Set(['deleteBranch', 'deleteRemoteBranch'])

async function perform(repoPath, body) {
  const fn = actions[body.action]
  if (!fn || !Object.prototype.hasOwnProperty.call(actions, body.action)) throw new Error('Hành động không hỗ trợ: ' + body.action)
  if (body.dryRun) {
    if (!DRY_RUN.has(body.action)) throw new Error('Hành động này không có chế độ dry-run')
    const r = await fn(repoPath, body)
    return { ok: true, dryRun: true, ...r }
  }
  let result, error
  try { result = await fn(repoPath, body) } catch (e) { error = e }
  audit({ repo: repoPath, action: body.action, params: { ...body, action: undefined, path: undefined, confirmName: undefined }, ok: !error, error: error?.message })
  if (error) throw error
  return { ok: true, output: typeof result === 'string' ? result : result?.output ?? '' }
}

/** n dòng nhật ký cuối, mới nhất trước. */
function recentActivity(n = 20) {
  let text
  try { text = fs.readFileSync(AUDIT, 'utf8') } catch { return [] }
  const out = []
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
    if (!lines[i]) continue
    try {
      const e = JSON.parse(lines[i])
      out.push({ at: e.at, repo: path.basename(e.repo || ''), action: e.action, ok: e.ok, error: e.error, detail: e.params?.branch || e.params?.ref || e.params?.name || e.params?.message || '' })
    } catch { /* bỏ dòng hỏng */ }
  }
  return out
}

module.exports = { audit, perform, recentActivity, run }
