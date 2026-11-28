// Đọc tiến trình trên macOS / Linux bằng `ps` + `lsof`, trả về cùng dạng dữ liệu như procs.ps1 (Windows).
// cpu = thời gian CPU tích lũy theo đơn vị 100ns (như Windows) để phần tính %CPU dùng chung; mem = byte.
const { execFile } = require('child_process')

const ENV = { ...process.env, LC_ALL: 'C' } // lstart luôn là tiếng Anh, dễ phân tích

const run = (cmd, args, timeout = 15000) => new Promise((resolve) => {
  // lsof thoát mã 1 khi một pid đã biến mất nhưng vẫn in kết quả của pid còn lại: luôn lấy stdout
  execFile(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024, env: ENV }, (err, stdout) => resolve({ err, stdout: String(stdout || '') }))
})

/** "[[dd-]hh:]mm:ss[.ff]" → đơn vị 100ns. */
function parseCpuTime(s) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(String(s).trim())
  if (!m) return 0
  const sec = (Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 3600 + Number(m[3]) * 60 + Number(m[4])
  return Math.round(sec * 1e7)
}

const clean = (s) => String(s).replace(/[\x00-\x1f\x7f]/g, ' ')

/** Dòng `ps -axo pid=,ppid=,rss=,time=,lstart=` → [{ pid, ppid, mem, cpu, start }]. */
function parseStat(out) {
  const res = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const t = new Date(m[5]).getTime()
    res.push({ pid: Number(m[1]), ppid: Number(m[2]), mem: Number(m[3]) * 1024, cpu: parseCpuTime(m[4]), start: Number.isNaN(t) ? null : new Date(t).toISOString() })
  }
  return res
}

/** Dòng `ps -axo pid=,<cột>=` → Map(pid → phần còn lại của dòng). */
function parsePidText(out) {
  const map = new Map()
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (m) map.set(Number(m[1]), m[2])
  }
  return map
}

/** Tên chương trình: phần cuối của đường dẫn `comm` (có thể chứa khoảng trắng). */
const baseName = (comm) => String(comm || '').replace(/\/+$/, '').split('/').pop() || ''

/** Đầu ra `lsof -Fpn` → Map(pid → [tên]); dòng 'p' đặt pid, dòng 'n' là tên (đường dẫn hoặc địa chỉ). */
function parseLsof(out) {
  const map = new Map()
  let pid = null
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n' && pid) { if (!map.has(pid)) map.set(pid, []); map.get(pid).push(line.slice(1)) }
  }
  return map
}

/** "*:5173" / "127.0.0.1:3000" / "[::1]:5173" → { port, host }. */
function parseListenAddr(n) {
  const m = /^(.*):(\d+)$/.exec(n)
  if (!m) return null
  return { port: Number(m[2]), host: m[1] === '*' ? '0.0.0.0' : m[1] }
}

/** Mọi tiến trình; cwd chỉ đọc cho tên khớp `wantCwd` (giống procs.ps1). */
async function listProcesses(wantCwd) {
  const [stat, comm, cmd] = await Promise.all([
    run('ps', ['-axo', 'pid=,ppid=,rss=,time=,lstart=']),
    run('ps', ['-axo', 'pid=,comm=']),
    run('ps', ['-axo', 'pid=,command=']),
  ])
  if (!stat.stdout) throw new Error('Không đọc được danh sách tiến trình' + (stat.err ? ': ' + stat.err.message : ''))
  const names = parsePidText(comm.stdout), cmds = parsePidText(cmd.stdout)
  const procs = parseStat(stat.stdout).filter((p) => p.pid > 1).map((p) => ({ ...p, name: baseName(names.get(p.pid)), cmd: cmds.has(p.pid) ? clean(cmds.get(p.pid)) : null, cwd: null }))
  const ids = procs.filter((p) => wantCwd(p.name)).map((p) => p.pid)
  if (ids.length) {
    const cwds = parseLsof((await run('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', ids.join(',')], 20000)).stdout)
    for (const p of procs) { const c = cwds.get(p.pid); if (c && c[0]) p.cwd = c[0] }
  }
  return procs
}

/** pid → [{ port, host }] các cổng TCP đang LISTEN. */
async function listeningPorts() {
  const map = new Map()
  const { stdout } = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])
  for (const [pid, names] of parseLsof(stdout)) {
    for (const n of names) {
      const a = parseListenAddr(n)
      if (!a) continue
      if (!map.has(pid)) map.set(pid, [])
      const l = map.get(pid)
      if (!l.some((x) => x.port === a.port)) l.push(a)
    }
  }
  return map
}

/** Dừng cả cây: SIGTERM từ lá lên gốc, sau 2,5s tiến trình nào còn sống thì SIGKILL. Trả về mô tả ngắn. */
async function killTree(pids) {
  const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
  const send = (sig) => { let n = 0; for (const pid of pids) { try { process.kill(pid, sig); n++ } catch { /* đã thoát */ } } return n }
  send('SIGTERM')
  await new Promise((r) => setTimeout(r, 2500))
  const left = pids.filter(alive)
  if (left.length) for (const pid of left) { try { process.kill(pid, 'SIGKILL') } catch { /* bỏ qua */ } }
  const still = left.filter((p) => { try { process.kill(p, 0); return true } catch { return false } })
  if (still.length) throw new Error('Không dừng được tiến trình: ' + still.join(', '))
  return `Đã dừng ${pids.length} tiến trình` + (left.length ? ` (${left.length} phải buộc dừng)` : '')
}

module.exports = { listProcesses, listeningPorts, killTree, _test: { parseCpuTime, parseStat, parsePidText, parseLsof, parseListenAddr, baseName } }
