// Chạy script của package.json ngay trong app (giai đoạn 12). Không nhận lệnh tự do:
// tên script phải có trong package.json của package đã dò thấy trong repo đã quét.
// Windows: npm / pnpm / yarn là .cmd nên gọi qua `cmd.exe /d /s /c`; an toàn nhờ whitelist ký tự cho tên script và tham số (không có & | < > ^ " % khoảng trắng…).
const { spawn, execFile, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const git = require('../git')
const gitActions = require('../git-actions')

const WIN = process.platform === 'win32'
const DATA = process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data')
const RUNS = path.join(DATA, 'runs')
const NAME_RE = /^[A-Za-z0-9:_.][A-Za-z0-9:_.-]*$/ // không bắt đầu bằng '-' để không thành cờ của npm
const ARG_RE = /^[A-Za-z0-9_@+=:,./\\-]+$/
const MAX_LINES = 5000
const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_KEEP = 50
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage'])

const runs = new Map() // id -> run
let counter = 0

const INDEX = path.join(RUNS, 'index.json')
/** Lịch sử bền: các lần chạy đã kết thúc (không kèm log trong bộ nhớ; xem lại log từ tệp .log). */
function saveIndex() {
  try { fs.mkdirSync(RUNS, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify([...runs.values()].filter((r) => r.end !== null).map(view))) } catch { /* không ghi được thì thôi */ }
}
function loadIndex() {
  try {
    for (const v of JSON.parse(fs.readFileSync(INDEX, 'utf8'))) {
      if (!v || typeof v.id !== 'string' || !/^[a-z0-9-]+$/.test(v.id) || v.running) continue
      let lines = []
      try { lines = fs.readFileSync(path.join(RUNS, v.id + '.log'), 'utf8').split(/\r?\n/).filter(Boolean).slice(-MAX_LINES) } catch { /* mất log */ }
      runs.set(v.id, { ...v, end: v.end, lines, seq: lines.length, file: path.join(RUNS, v.id + '.log'), fileBytes: MAX_LOG_BYTES, child: null })
    }
  } catch { /* chưa có lịch sử */ }
}

function manager(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f))
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  if (has('package-lock.json')) return 'npm'
  const parent = path.dirname(dir)
  if (parent !== dir && (fs.existsSync(path.join(parent, 'pnpm-lock.yaml')))) return 'pnpm'
  return 'npm'
}

function readScripts(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const s = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {}
    const out = {}
    for (const [k, v] of Object.entries(s)) if (NAME_RE.test(k) && typeof v === 'string') out[k] = v
    return { name: typeof pkg.name === 'string' ? pkg.name : '', scripts: out }
  } catch { return null }
}

/** Các package có `scripts` trong repo: gốc và package con sâu tối đa 2 cấp. */
function listPackages(repoPath) {
  const root = git.knownRepo(String(repoPath || ''))
  const out = []
  const walk = (dir, depth) => {
    const pkg = readScripts(dir)
    if (pkg && Object.keys(pkg.scripts).length) out.push({ rel: path.relative(root, dir).split(path.sep).join('/'), name: pkg.name, manager: manager(dir), scripts: pkg.scripts })
    if (depth >= 2) return
    let ents = []
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1)
  }
  walk(root, 0)
  return { root, packages: out }
}

function parseArgs(text) {
  const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
  for (const p of parts) if (!ARG_RE.test(p)) throw new Error('Tham số chứa ký tự không cho phép: ' + p)
  if (parts.length > 20) throw new Error('Quá nhiều tham số')
  return parts
}

const PORT_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/i

function push(run, text) {
  for (const line of text.split(/\r?\n/)) {
    if (line === '' ) continue
    if (!run.port) { const m = PORT_RE.exec(line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')); if (m) run.port = Number(m[1]) }
    run.lines.push(line)
    run.seq++
    if (run.lines.length > MAX_LINES) run.lines.shift()
  }
  if (run.fileBytes < MAX_LOG_BYTES) { run.fileBytes += text.length; try { fs.appendFileSync(run.file, text) } catch { /* bỏ qua */ } }
}

function view(r) {
  return { id: r.id, repo: r.repo, rel: r.rel, script: r.script, args: r.args, manager: r.manager, pid: r.pid, start: r.start, end: r.end, code: r.code, port: r.port, running: r.end === null, seq: r.seq }
}

function prune() {
  const done = [...runs.values()].filter((r) => r.end !== null).sort((a, b) => a.start.localeCompare(b.start))
  while (done.length > MAX_KEEP) { const r = done.shift(); runs.delete(r.id); try { fs.unlinkSync(r.file) } catch { /* ok */ } }
}

function run(body) {
  const { root, packages } = listPackages(body.path)
  const rel = String(body.dir || '')
  const pkg = packages.find((p) => p.rel === rel)
  if (!pkg) throw new Error('Không có package này trong repo')
  const script = String(body.script || '')
  if (!NAME_RE.test(script) || !Object.prototype.hasOwnProperty.call(pkg.scripts, script)) throw new Error('Script không có trong package.json')
  const args = parseArgs(body.args)
  const running = [...runs.values()].find((r) => r.end === null && r.repo === root && r.rel === rel && r.script === script)
  if (running) throw new Error('Script này đang chạy (id ' + running.id + '). Dừng bản cũ trước.')
  const cwd = path.join(root, rel)
  const argv = ['run', script, ...(args.length ? (pkg.manager === 'yarn' ? args : ['--', ...args]) : [])]
  const id = Date.now().toString(36) + '-' + (++counter)
  fs.mkdirSync(RUNS, { recursive: true })
  const r = { id, repo: root, rel, script, args, manager: pkg.manager, pid: 0, start: new Date().toISOString(), end: null, code: null, port: 0, lines: [], seq: 0, file: path.join(RUNS, id + '.log'), fileBytes: 0, child: null }
  runs.set(id, r)
  const env = { ...process.env, FORCE_COLOR: '1' }
  // Script chạy vitest: nạp preload của DevDeck (nếu đã cài ở tab Job) để tab Job thấy tiến độ "N/M file"
  const preload = path.join(os.homedir(), '.devdeck', 'preload.cjs')
  if (/vitest/.test(pkg.scripts[script]) && fs.existsSync(preload) && !String(env.NODE_OPTIONS || '').includes('preload.cjs')) env.NODE_OPTIONS = (env.NODE_OPTIONS ? env.NODE_OPTIONS + ' ' : '') + '--require="' + preload + '"'
  const child = WIN
    ? spawn('cmd.exe', ['/d', '/s', '/c', pkg.manager, ...argv], { cwd, windowsHide: true, env })
    : spawn(pkg.manager, argv, { cwd, detached: true, env })
  r.child = child
  r.pid = child.pid || 0
  const t0 = Date.now()
  const finish = (code, err) => {
    if (r.end !== null) return
    r.end = new Date().toISOString()
    r.code = code
    if (err) push(r, '[DevDeck] ' + err + '\n')
    gitActions.audit({ repo: root, action: 'runScript', params: { dir: rel, script, args, code, ms: Date.now() - t0 }, ok: code === 0, error: code === 0 ? undefined : (err || 'mã thoát ' + code) })
    prune()
    saveIndex()
  }
  child.stdout.on('data', (d) => push(r, d.toString()))
  child.stderr.on('data', (d) => push(r, d.toString()))
  child.on('error', (e) => finish(-1, e.message))
  child.on('close', (code, signal) => finish(code === null ? (signal ? -2 : -1) : code))
  return view(r)
}

function killTree(r) {
  return new Promise((resolve) => {
    if (WIN) execFile('taskkill', ['/PID', String(r.pid), '/T', '/F'], { windowsHide: true, timeout: 20000 }, () => resolve())
    else { try { process.kill(-r.pid, 'SIGTERM') } catch { try { process.kill(r.pid, 'SIGTERM') } catch { /* đã thoát */ } } resolve() }
  })
}

async function stop(id) {
  const r = runs.get(String(id))
  if (!r) throw new Error('Không tìm thấy lần chạy')
  if (r.end !== null) return view(r)
  await killTree(r)
  gitActions.audit({ repo: r.repo, action: 'stopScript', params: { dir: r.rel, script: r.script, pid: r.pid }, ok: true })
  return view(r)
}

/** Khi thoát app: dừng đồng bộ để lệnh kill kịp chạy trước khi tiến trình chính kết thúc. */
function stopAll() {
  for (const r of runs.values()) {
    if (r.end !== null || !r.pid) continue
    try { if (WIN) execFileSync('taskkill', ['/PID', String(r.pid), '/T', '/F'], { windowsHide: true, timeout: 5000, stdio: 'ignore' }); else process.kill(-r.pid, 'SIGTERM') } catch { /* đã thoát */ }
  }
}

/** pid đang chạy của các lần chạy từ app → id; tab Job dùng để gắn nhãn "chạy từ app". */
function livePids() { const m = new Map(); for (const r of runs.values()) if (r.end === null && r.pid) m.set(r.pid, r.id); return m }

function list() { return [...runs.values()].sort((a, b) => b.start.localeCompare(a.start)).map(view) }

/** Log từ dòng thứ `since` (số thứ tự tuyệt đối). Dòng cũ đã rơi khỏi bộ đệm thì trả từ dòng cũ nhất còn giữ. */
function log(id, since) {
  const r = runs.get(String(id))
  if (!r) throw new Error('Không tìm thấy lần chạy')
  const first = r.seq - r.lines.length
  const from = Math.max(Number(since) || 0, first)
  return { run: view(r), from, lines: r.lines.slice(from - first) }
}

loadIndex()

module.exports = { livePids, listPackages, run, stop, stopAll, list, log, _test: { parseArgs, manager, PORT_RE, NAME_RE } }
