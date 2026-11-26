// Theo dõi tiến trình đang chạy (test, build, dev server...) trong các repo đã quét, và dừng chúng.
// Chỉ hỗ trợ Windows: đọc thư mục làm việc của tiến trình qua PEB (procs.ps1).
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const git = require('../git')
const gitActions = require('../git-actions')

// PowerShell không đọc được file trong app.asar nên script được giải nén ra app.asar.unpacked
const SCRIPT = path.join(__dirname, 'procs.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

// Runtime/công cụ coi là "job". Shell, editor, claude, ghosthand, gopls... cố ý không nằm đây.
const JOB_EXE = /^(node|bun|deno|python[\d.]*|pythonw|py|dotnet|java|javaw|go|cargo|rustc|php|ruby|mvn|gradle|gradlew|npm|npx|pnpm|yarn|vitest|jest|pytest|tsc|vite|webpack|esbuild|playwright|cypress|.+\.test)(\.exe|\.cmd)?$/i
// Tiến trình của editor/IDE hay chạy nền trong repo, không phải job của người dùng
const IGNORE_CMD = /tsserver|typingsInstaller|\\\.vscode\\|\\\.vscode-|microsoft vs code|claude-code|\\ghosthand|language-server|eslintServer|\\\.cursor\\|\\jetbrains\\|\\\.gemini\\|cloudcode/i

const FILE = path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data'), 'jobs.json')
const MAX_RECENT = 10

/** Thư mục theo dõi job. Chưa chọn riêng thì dùng chung thư mục quét của trang Git. */
function loadConfig() {
  let saved = null
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { /* chưa có file */ }
  const custom = Array.isArray(saved?.folders) && saved.folders.length > 0
  const gitCfg = git.loadConfig()
  return {
    folders: custom ? saved.folders : gitCfg.roots,
    custom,
    recent: [...new Set([...(Array.isArray(saved?.recent) ? saved.recent : []), ...gitCfg.recent])].slice(0, MAX_RECENT),
  }
}

/** Lưu danh sách thư mục; rỗng = quay về dùng thư mục của Git. */
function saveConfig(input) {
  const folders = [...new Set((input.folders || []).map((r) => String(r).trim()).filter(Boolean).map((r) => path.resolve(r)))]
  for (const r of folders) {
    let st
    try { st = fs.statSync(r) } catch { throw new Error('Không tìm thấy thư mục: ' + r) }
    if (!st.isDirectory()) throw new Error('Không phải thư mục: ' + r)
  }
  const prev = loadConfig()
  const recent = [...folders, ...prev.recent.filter((r) => !folders.includes(r))].slice(0, MAX_RECENT)
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify({ folders, recent }, null, 2))
  return loadConfig()
}

function listProcesses() {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT],
      { windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('Không đọc được danh sách tiến trình: ' + err.message))
        try { const a = JSON.parse(stdout || '[]'); resolve(Array.isArray(a) ? a : [a]) } catch { reject(new Error('Kết quả tiến trình không hợp lệ')) }
      })
  })
}

const inside = (c, n) => c === n || c.startsWith(n + '\\')

/** Nhóm của một cwd: repo sâu nhất chứa nó; không có repo thì thư mục theo dõi chứa nó; ngoài các thư mục theo dõi thì null. */
function groupOf(cwd, folders, repos) {
  const c = norm(cwd)
  if (!folders.some((f) => inside(c, f.n))) return null
  let best = null
  for (const r of repos) if (inside(c, r.n) && (!best || r.n.length > best.n.length)) best = r
  if (best) return best
  for (const f of folders) if (inside(c, f.n) && (!best || f.n.length > best.n.length)) best = f
  return best
}

async function scan() {
  if (process.platform !== 'win32') return { supported: false, at: new Date().toISOString(), jobs: [] }
  const [procs, listening] = await Promise.all([listProcesses(), listeningPorts()])
  const cfg = loadConfig()
  const folders = cfg.folders.map((p) => ({ path: p, n: norm(p) })).filter((r) => r.n)
  const repos = git.repoPathsInfo().paths.map((p) => ({ path: p, n: norm(p) })).filter((r) => r.n)
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  const kids = new Map()
  for (const p of procs) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p) }

  // Loại chính DevDeck: tiến trình hiện tại, tổ tiên và hậu duệ của nó
  const self = new Set()
  for (let p = byPid.get(process.pid), i = 0; p && i < 20; p = byPid.get(p.ppid), i++) self.add(p.pid)
  const down = (pid) => { self.add(pid); for (const c of kids.get(pid) || []) if (!self.has(c.pid)) down(c.pid) }
  down(process.pid)

  const match = new Map()
  for (const p of procs) {
    if (self.has(p.pid) || !p.cwd || !JOB_EXE.test(p.name) || IGNORE_CMD.test(p.cmd || '')) continue
    const repo = groupOf(p.cwd, folders, repos)
    if (repo) match.set(p.pid, { p, repo })
  }
  const hasMatchedAncestor = (p) => { for (let a = byPid.get(p.ppid), i = 0; a && i < 30; a = byPid.get(a.ppid), i++) if (match.has(a.pid)) return true; return false }
  // Các tiến trình con đang sống của một job (phẳng); giới hạn số lượng để phản hồi không phình to
  const live = (pid, acc = []) => {
    for (const c of kids.get(pid) || []) {
      if (acc.length >= 200) break
      acc.push(c)
      live(c.pid, acc)
    }
    return acc
  }

  const now = Date.now()
  const progressByPid = readProgress()
  const jobs = []
  const seenJobs = new Set()
  for (const { p, repo } of match.values()) {
    if (hasMatchedAncestor(p)) continue
    const jobKey = p.pid + ':' + p.start
    seenJobs.add(jobKey)
    const members = track(jobKey, [p, ...live(p.pid)], now, listening)
    const root = members.find((m) => m.pid === p.pid)
    const procs = order(members, p.pid)
    const alive = procs.filter((m) => !m.done)
    const parent = byPid.get(p.ppid)
    const ports = jobPorts(alive)
    const progress = progressFor([p, ...procs], progressByPid)
    jobs.push({
      pid: p.pid, ppid: p.ppid, parent: parent ? parent.name : '', name: p.name, cmd: p.cmd || '', cwd: p.cwd.replace(/[\\/]+$/, ''), repo: repo.path,
      start: p.start, cpu: root.cpu, mem: (p.mem || 0) + alive.reduce((s, c) => s + c.mem, 0), children: alive.length,
      stats: { running: alive.filter((m) => m.cpu !== null && m.cpu >= BUSY).length, idle: alive.filter((m) => m.cpu === null || m.cpu < BUSY).length, done: procs.filter((m) => m.done).length },
      procs, progress, ports, kind: classify(procs.map((m) => m.cmd).concat(p.cmd || ''), ports, progress),
    })
  }
  for (const k of hist.keys()) if (!seenJobs.has(k)) hist.delete(k) // job đã kết thúc: quên lịch sử
  jobs.sort((a, b) => a.repo.localeCompare(b.repo) || String(a.start).localeCompare(String(b.start)))
  return { supported: true, at: new Date().toISOString(), folders: cfg.folders, jobs }
}

// ---- Tiến độ test: reporter trong vitest (vitest-reporter.mjs) ghi ~/.devdeck/progress/<pid>.json ----
const PROGRESS_DIR = path.join(os.homedir(), '.devdeck', 'progress')
const REPORTER_SRC = path.join(__dirname, 'vitest-reporter.mjs')
const REPORTER_REL = path.join('node_modules', '.devdeck', 'reporter.mjs')

/** Đọc mọi file tiến độ (pid → dữ liệu); xóa file quá 2 ngày. */
function readProgress() {
  const out = new Map()
  let names
  try { names = fs.readdirSync(PROGRESS_DIR) } catch { return out }
  for (const n of names) {
    if (!/^\d+\.json$/.test(n)) continue
    const f = path.join(PROGRESS_DIR, n)
    try {
      const st = fs.statSync(f)
      if (Date.now() - st.mtimeMs > 2 * 864e5) { fs.unlinkSync(f); continue }
      const d = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (d && Array.isArray(d.files)) out.set(Number(n.slice(0, -5)), d)
    } catch { /* bỏ file hỏng */ }
  }
  return out
}

/** Tiến độ của job: tìm file tiến độ của tiến trình nào đó trong cây job (khớp pid và thời điểm khởi động để tránh dùng lại PID cũ). */
function progressFor(members, byPid) {
  for (const m of members) {
    const d = byPid.get(m.pid)
    if (!d || m.done) continue
    if (Date.parse(m.start) > d.startedAt + 10000) continue // file thuộc tiến trình cũ trùng PID
    const files = d.files
    const count = (s) => files.filter((f) => f.state === s).length
    const pass = count('pass'), fail = count('fail'), skip = count('skip'), running = count('running')
    return { runner: d.runner, finished: !!d.finished, updatedAt: d.updatedAt, total: files.length, done: pass + fail + skip, pass, fail, skip, running, files }
  }
  return null
}

/** Chép reporter vào <repo>/node_modules/.devdeck/ (vitest chỉ nạp được reporter nằm trong thư mục dự án; node_modules thường đã bị gitignore). */
function installReporter(repoPath) {
  const target = norm(repoPath)
  const ok = loadConfig().folders.some((f) => inside(target, norm(f))) || git.repoPathsInfo().paths.some((p) => norm(p) === target)
  if (!ok) throw new Error('Thư mục không nằm trong danh sách theo dõi')
  const dest = path.join(path.resolve(repoPath), REPORTER_REL)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(REPORTER_SRC, dest)
  return { ok: true, path: dest, rel: './' + REPORTER_REL.replace(/\\/g, '/') }
}

// ---- Cổng đang lắng nghe (netstat) và phân loại job: test / dev server / build ----
/** pid → [{ port, host }] các cổng TCP đang LISTEN. */
function listeningPorts() {
  return new Promise((resolve) => {
    // Không lọc "-p TCP" vì sẽ mất cổng IPv6 ([::1]:5173) mà Vite/Node mới hay dùng; dòng UDP bị regex bên dưới bỏ qua
    execFile('netstat', ['-ano'], { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const map = new Map()
      if (err) return resolve(map)
      for (const line of String(stdout).split(/\r?\n/)) {
        // Ví dụ: "TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    42304" hoặc "TCP    [::1]:5173 ..."
        const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i)
        if (!m) continue
        const pid = Number(m[3]), port = Number(m[2])
        if (!map.has(pid)) map.set(pid, [])
        const list = map.get(pid)
        if (!list.some((x) => x.port === port)) list.push({ port, host: m[1] })
      }
      resolve(map)
    })
  })
}

/** Các cổng đang lắng nghe của mọi tiến trình còn sống trong job (gộp trùng theo số cổng). */
function jobPorts(alive) {
  const out = []
  for (const m of alive) for (const x of m.ports || []) if (!out.some((o) => o.port === x.port)) out.push({ port: x.port, host: x.host, pid: m.pid })
  return out.sort((a, b) => a.port - b.port)
}

const TEST_RE = /(^|[\s\\/])(vitest|jest|pytest|mocha|karma|playwright|cypress|ava)(\.[a-z]+)?(\s|$)|\b(go|dotnet|cargo|npm|pnpm|yarn)\s+(run\s+)?test\b|\.test(\.exe)?\b/i
const DEV_RE = /\b(vite|next|nuxt|webpack-dev-server|webpack\s+serve|ng\s+serve|astro|remix|parcel|nodemon|ts-node-dev|tsx\s+watch)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|watch)\b|\b(go\s+run|flask\s+run|uvicorn|gunicorn|rails\s+s|dotnet\s+watch)\b/i
const BUILD_RE = /\b(tsc|esbuild|rollup|webpack|gradle|mvn|msbuild)\b|\b(npm|pnpm|yarn)\s+(run\s+)?(build|compile|lint|typecheck)\b|\b(go|cargo|dotnet)\s+build\b/i
/** test = chạy test · dev = dev server (có cổng lắng nghe hoặc lệnh dev) · build = biên dịch/đóng gói · other. Test được ưu tiên vì vitest có thể mở cổng UI. */
function classify(cmds, ports, progress) {
  const text = cmds.join('\n')
  if (progress || TEST_RE.test(text)) return 'test'
  if (ports.length || DEV_RE.test(text)) return 'dev'
  if (BUILD_RE.test(text)) return 'build'
  return 'other'
}

// ---- Trạng thái từng tiến trình: CPU giữa hai lần quét + nhớ tiến trình con đã kết thúc ----
const BUSY = 1 // % CPU trở lên coi là "đang chạy"; thấp hơn là "đang chờ"
const cpuPrev = new Map() // pid:start → { raw, at }
const hist = new Map() // jobKey → Map(pid:start → mục)

/** Cập nhật lịch sử của job: tính %CPU, đánh dấu tiến trình đã biến mất là "xong". Trả về mọi mục (cả đã xong). */
function track(jobKey, current, now, listening = new Map()) {
  if (!hist.has(jobKey)) hist.set(jobKey, new Map())
  const h = hist.get(jobKey)
  const present = new Set()
  for (const c of current) {
    const key = c.pid + ':' + c.start
    present.add(key)
    const prev = cpuPrev.get(key)
    const raw = Number(c.cpu) || 0
    // 1 ms = 10.000 đơn vị 100ns; có thể vượt 100% khi dùng nhiều nhân
    const cpu = prev && now > prev.at ? Math.min(999, Math.max(0, ((raw - prev.raw) / ((now - prev.at) * 10000)) * 100)) : null
    cpuPrev.set(key, { raw, at: now })
    const old = h.get(key)
    h.set(key, { key, pid: c.pid, ppid: c.ppid, name: c.name, cmd: (c.cmd || '').slice(0, 2000), start: c.start, mem: c.mem || 0, cpu, ports: listening.get(c.pid) || [], done: false, firstSeen: old?.firstSeen ?? now, endedAt: null })
  }
  for (const [key, e] of h) {
    if (present.has(key) || e.done) continue
    e.done = true; e.cpu = 0; e.mem = 0; e.ports = []; e.endedAt = now
  }
  if (h.size > 400) for (const [key, e] of h) { if (e.done && h.size > 400) h.delete(key) }
  if (cpuPrev.size > 5000) cpuPrev.clear()
  return [...h.values()]
}

/** Xếp mục theo thứ tự cây (cha trước con), kèm độ sâu; mục mồ côi (cha đã mất khỏi lịch sử) đặt dưới gốc. */
function order(members, rootPid) {
  const byParent = new Map()
  for (const m of members) { if (!byParent.has(m.ppid)) byParent.set(m.ppid, []); byParent.get(m.ppid).push(m) }
  const out = []
  const seen = new Set()
  const walk = (pid, depth) => {
    for (const m of (byParent.get(pid) || []).sort((a, b) => a.firstSeen - b.firstSeen || a.pid - b.pid)) {
      if (seen.has(m.key)) continue
      seen.add(m.key)
      out.push({ pid: m.pid, ppid: m.ppid, depth, name: m.name, cmd: m.cmd, mem: m.mem, cpu: m.cpu, ports: m.ports || [], start: m.start, done: m.done, endedAt: m.endedAt })
      walk(m.pid, depth + 1)
    }
  }
  walk(rootPid, 1)
  for (const m of members) if (m.pid !== rootPid && !seen.has(m.key)) { seen.add(m.key); out.push({ pid: m.pid, ppid: m.ppid, depth: 1, name: m.name, cmd: m.cmd, mem: m.mem, cpu: m.cpu, ports: m.ports || [], start: m.start, done: m.done, endedAt: m.endedAt }) }
  return out
}

function taskkill(pid) {
  return new Promise((resolve, reject) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message).trim()))
      resolve((stdout || '').trim())
    })
  })
}

/** Dừng cả cây tiến trình của một job. Chỉ nhận pid đang là job trong lần quét mới và còn đúng thời điểm khởi động. */
async function stop(body) {
  const pid = Number(body.pid)
  if (!Number.isInteger(pid) || pid <= 4) throw new Error('PID không hợp lệ')
  const fresh = await scan() // quét lại để chắc tiến trình vẫn là job đó (tránh PID bị tái sử dụng)
  const job = fresh.jobs.find((j) => j.pid === pid && j.start === body.start)
  if (!job) throw new Error('Job không còn chạy (hoặc đã đổi). Hãy làm mới danh sách.')
  let error, output
  try { output = await taskkill(pid) } catch (e) { error = e }
  gitActions.audit({ repo: job.repo, action: 'stopJob', params: { pid, name: job.name, cmd: job.cmd.slice(0, 300) }, ok: !error, error: error?.message })
  if (error) throw error
  return { ok: true, output }
}

module.exports = { scan, stop, loadConfig, saveConfig, installReporter }
