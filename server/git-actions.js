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

const actions = {
  async checkout(cwd, { branch, remote }) {
    await checkBranchName(cwd, branch)
    if (remote) {
      // "origin/feat" → tạo nhánh local "feat" theo dõi remote
      const local = branch.slice(branch.indexOf('/') + 1)
      const exists = await run(cwd, ['rev-parse', '--verify', '-q', 'refs/heads/' + local]).then(() => true, () => false)
      return run(cwd, exists ? ['switch', local] : ['switch', '--track', branch])
    }
    return run(cwd, ['switch', branch])
  },
  async createBranch(cwd, { name, checkout = true }) {
    await checkBranchName(cwd, name)
    return run(cwd, checkout ? ['switch', '-c', name] : ['branch', name])
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

async function perform(repoPath, body) {
  const fn = actions[body.action]
  if (!fn || !Object.prototype.hasOwnProperty.call(actions, body.action)) throw new Error('Hành động không hỗ trợ: ' + body.action)
  let output, error
  try { output = await fn(repoPath, body) } catch (e) { error = e }
  try {
    fs.mkdirSync(path.dirname(AUDIT), { recursive: true })
    fs.appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), repo: repoPath, action: body.action, params: { ...body, action: undefined, path: undefined }, ok: !error, error: error?.message }) + '\n')
  } catch { /* không để lỗi ghi log làm hỏng hành động */ }
  if (error) throw error
  return { ok: true, output }
}

module.exports = { perform }
