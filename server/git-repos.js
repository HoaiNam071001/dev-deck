// Thao tác ở mức repo: tạo mới, clone (có tiến độ, hủy được), xóa khỏi máy (vào Thùng rác).
// Mọi đường dẫn phải nằm trong các thư mục gốc đã cấu hình; không chạy qua shell.
const { execFile, spawn } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const git = require('./git')
const { audit, run } = require('./git-actions')

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const CLONE_URL = /^(https:\/\/[^\s'"`$;|&<>]+|ssh:\/\/[^\s'"`$;|&<>]+|git@[\w.-]+:[^\s'"`$;|&<>]+)$/
const GITIGNORE = 'node_modules/\ndist/\nbuild/\n.env\n*.log\n.DS_Store\n'

const norm = (p) => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Thư mục nằm trong (hoặc bằng) một thư mục gốc đã cấu hình. */
function insideRoots(p, { allowRoot }) {
  const x = norm(p)
  return git.loadConfig().roots.some((r) => {
    const root = norm(r)
    return x.startsWith(root + '/') || (allowRoot && x === root)
  })
}

function checkFolderName(name) {
  if (typeof name !== 'string') throw new Error('Thiếu tên thư mục')
  const n = name.trim()
  if (!n || n.length > 100) throw new Error('Tên thư mục phải dài 1–100 ký tự')
  if (n === '.' || n === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(n) || /[. ]$/.test(n) || n.startsWith('-') || WIN_RESERVED.test(n)) {
    throw new Error('Tên thư mục không hợp lệ: ' + n)
  }
  return n
}

function checkParent(parent) {
  if (typeof parent !== 'string' || !parent) throw new Error('Chưa chọn thư mục cha')
  const p = path.resolve(parent)
  if (!insideRoots(p, { allowRoot: true })) throw new Error('Thư mục cha phải nằm trong thư mục quét đã cấu hình')
  let st
  try { st = fs.statSync(p) } catch { throw new Error('Không tìm thấy thư mục cha') }
  if (!st.isDirectory()) throw new Error('Thư mục cha không phải thư mục')
  return p
}

function targetOf(parent, name) {
  const dir = checkParent(parent)
  const n = checkFolderName(name)
  const target = path.join(dir, n)
  if (fs.existsSync(target)) throw new Error('Đã có thư mục tên ' + n + ' trong ' + dir)
  return { dir, name: n, target }
}

// ---------------------------------------------------------------- tạo repo mới
async function createRepo({ parent, name, readme, gitignore }) {
  const t = targetOf(parent, name)
  fs.mkdirSync(t.target)
  try {
    await run(t.target, ['init'])
    await run(t.target, ['symbolic-ref', 'HEAD', 'refs/heads/main']).catch(() => {})
    if (readme === true) fs.writeFileSync(path.join(t.target, 'README.md'), `# ${t.name}\n`)
    if (gitignore === true) fs.writeFileSync(path.join(t.target, '.gitignore'), GITIGNORE)
  } catch (e) {
    fs.rmSync(t.target, { recursive: true, force: true }) // thư mục do chính ta vừa tạo
    throw e
  }
  git.invalidate()
  audit({ repo: t.target, action: 'createRepo', params: { name: t.name, readme: readme === true, gitignore: gitignore === true }, ok: true })
  return { ok: true, path: t.target }
}

// ---------------------------------------------------------------- clone
const clones = new Map()
const PHASE = { 'Receiving objects': 'Tải đối tượng', 'Resolving deltas': 'Giải nén delta', 'Counting objects': 'Đếm đối tượng', 'Compressing objects': 'Nén đối tượng', 'Enumerating objects': 'Liệt kê đối tượng', 'Updating files': 'Ghi tệp' }

function nameFromUrl(url) {
  const last = url.replace(/\/+$/, '').split(/[/:]/).pop() || ''
  return last.replace(/\.git$/, '')
}

function killTree(proc) {
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {})
  else proc.kill('SIGTERM')
}

function startClone({ url, parent, name }) {
  if (typeof url !== 'string' || !CLONE_URL.test(url.trim())) throw new Error('URL phải bắt đầu bằng https://, ssh:// hoặc git@')
  url = url.trim()
  const t = targetOf(parent, name || nameFromUrl(url))
  for (const [id, j] of clones) if (j.status !== 'running' && Date.now() - j.endedAt > 10 * 60000) clones.delete(id)
  if ([...clones.values()].some((j) => j.status === 'running' && norm(j.target) === norm(t.target))) throw new Error('Đang clone vào thư mục này rồi')

  const id = crypto.randomBytes(6).toString('hex')
  const job = { id, url, target: t.target, name: t.name, status: 'running', percent: 0, phase: 'Kết nối…', tail: [], error: null, endedAt: 0, proc: null, cancelled: false }
  clones.set(id, job)
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  if (!env.GIT_SSH_COMMAND) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
  const proc = spawn('git', ['-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=never', 'clone', '--progress', '--', url, t.target], { cwd: t.dir, env, windowsHide: true })
  job.proc = proc
  let buf = ''
  proc.stderr.on('data', (c) => {
    buf += c
    const parts = buf.split(/[\r\n]+/)
    buf = parts.pop()
    for (const line of parts) {
      if (!line.trim()) continue
      job.tail = [...job.tail.slice(-9), line.trim()]
      const m = /^(.+?):\s+(\d+)%/.exec(line.trim())
      if (m) { job.phase = PHASE[m[1]] ?? m[1]; job.percent = Number(m[2]) }
    }
  })
  const finish = (error) => {
    if (job.status !== 'running') return
    job.endedAt = Date.now(); job.proc = null
    if (job.cancelled) job.status = 'cancelled'
    else if (error) { job.status = 'error'; job.error = error }
    else job.status = 'done'
    if (job.status !== 'done') fs.rmSync(t.target, { recursive: true, force: true }) // dọn bản clone dở
    else { job.percent = 100; git.invalidate() }
    audit({ repo: t.target, action: 'clone', params: { url: url.replace(/\/\/[^@/]+@/, '//***@') }, ok: job.status === 'done', error: job.error || undefined })
  }
  proc.on('error', (e) => finish(e.message))
  proc.on('close', (code) => finish(code === 0 ? null : job.tail.filter((l) => !/^\d+%|Cloning into/.test(l)).pop() || 'git clone thất bại (mã ' + code + ')'))
  return view(job)
}

const view = (j) => ({ id: j.id, url: j.url, path: j.target, name: j.name, status: j.status, percent: j.percent, phase: j.phase, error: j.error })

function cloneStatus(id) {
  const j = clones.get(id)
  if (!j) throw new Error('Không có tác vụ clone này')
  return view(j)
}

function cancelClone(id) {
  const j = clones.get(id)
  if (!j) throw new Error('Không có tác vụ clone này')
  if (j.status === 'running' && j.proc) { j.cancelled = true; killTree(j.proc) }
  return view(j)
}

// ---------------------------------------------------------------- xóa repo (chuyển vào Thùng rác)
function toTrash(p) {
  const opts = { timeout: 180000, windowsHide: true }
  return new Promise((resolve, reject) => {
    const done = (err, _o, stderr) => (err ? reject(new Error('Không chuyển được vào Thùng rác: ' + ((stderr || err.message).trim().split('\n')[0]))) : resolve())
    if (process.platform === 'win32') {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:DEVDECK_TRASH,'OnlyErrorDialogs','SendToRecycleBin')"],
      { ...opts, env: { ...process.env, DEVDECK_TRASH: p } }, done)
    } else if (process.platform === 'darwin') {
      execFile('osascript', ['-e', 'on run argv', '-e', 'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)', '-e', 'end run', p], opts, done)
    } else execFile('gio', ['trash', p], opts, done)
  })
}

async function repoInfo(p) {
  const [status, branches, stash, remotes] = await Promise.all([
    run(p, ['status', '--porcelain']).catch(() => ''),
    run(p, ['for-each-ref', '--format=%(refname:short)\x1f%(upstream)\x1f%(upstream:track)', 'refs/heads']).catch(() => ''),
    run(p, ['stash', 'list']).catch(() => ''),
    run(p, ['remote']).catch(() => ''),
  ])
  const unpushed = branches.split('\n').filter(Boolean).map((l) => l.split('\x1f')).filter(([, up, track]) => !up || /ahead/.test(track || '')).map(([n]) => n)
  const me = norm(p)
  const nested = git.repoPathsInfo().paths.filter((x) => norm(x).startsWith(me + '/')).length
  return {
    dirty: status.split('\n').filter(Boolean).length, unpushed, stashes: stash.split('\n').filter(Boolean).length,
    hasRemote: remotes.split('\n').some(Boolean), nested,
  }
}

async function deleteRepo({ path: repoPath, dryRun, confirmName }) {
  const p = git.knownRepo(String(repoPath || ''))
  if (!insideRoots(p, { allowRoot: false })) throw new Error('Chỉ xóa repo nằm bên trong thư mục quét, không xóa chính thư mục gốc')
  const info = await repoInfo(p)
  if (info.nested > 0) throw new Error(`Thư mục này chứa ${info.nested} repo khác, hãy xóa từng repo con trước`)
  if (dryRun) return { ok: true, dryRun: true, info: { ...info, name: path.basename(p), path: p } }
  if (confirmName !== path.basename(p)) throw new Error('Cần gõ đúng tên repo để xác nhận')
  let error
  try {
    await toTrash(p)
    if (fs.existsSync(p)) throw new Error('Không chuyển được vào Thùng rác (thư mục vẫn còn)')
  } catch (e) { error = e }
  audit({ repo: p, action: 'deleteRepo', params: { dirty: info.dirty, unpushed: info.unpushed.length, stashes: info.stashes }, ok: !error, error: error?.message })
  if (error) throw error
  git.invalidate()
  return { ok: true }
}

module.exports = { createRepo, startClone, cloneStatus, cancelClone, deleteRepo, checkFolderName, nameFromUrl, CLONE_URL }
