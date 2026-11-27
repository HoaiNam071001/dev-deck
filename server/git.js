// Chỉ chạy các lệnh git ĐỌC (status, for-each-ref, log, remote, stash list).
// Lệnh ghi sẽ nằm ở server/git-actions.js (xem plan/03).
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const MAX_RECENT = 10
const CONFIG_FILE = path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', 'data'), 'config.json')
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor', 'AppData', '.cache', '__pycache__', '.venv', 'venv'])
const SEP = '\x1f'

function defaults() {
  const env = process.env.GIT_ROOTS
  return { roots: env ? env.split(path.delimiter).filter(Boolean) : [path.join(os.homedir(), 'Desktop')], depth: 4, recent: [] }
}

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    const d = defaults()
    return {
      roots: Array.isArray(c.roots) && c.roots.length ? c.roots : d.roots,
      depth: Number(c.depth) || d.depth,
      recent: Array.isArray(c.recent) ? c.recent.filter((x) => typeof x === 'string').slice(0, MAX_RECENT) : [],
    }
  } catch { return defaults() }
}

let repoCache = null

function saveConfig(input) {
  const roots = [...new Set((input.roots || []).map((r) => String(r).trim()).filter(Boolean).map((r) => path.resolve(r)))]
  if (!roots.length) throw new Error('Cần ít nhất một thư mục gốc')
  for (const r of roots) {
    let st
    try { st = fs.statSync(r) } catch { throw new Error('Không tìm thấy thư mục: ' + r) }
    if (!st.isDirectory()) throw new Error('Không phải thư mục: ' + r)
  }
  const depth = Math.min(8, Math.max(1, Number(input.depth) || 4))
  // Lịch sử thư mục đã quét: mới nhất lên đầu, bỏ trùng, tối đa MAX_RECENT
  const recent = [...roots, ...loadConfig().recent.filter((r) => !roots.includes(r))].slice(0, MAX_RECENT)
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ roots, depth, recent }, null, 2))
  repoCache = null
  return { roots, depth, recent }
}

function git(cwd, args, timeout = 20000) {
  return new Promise((resolve) => {
    execFile('git', ['-c', 'core.quotepath=off', ...args], {
      cwd, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout) => resolve(err ? null : stdout))
  })
}

/** Worktree phụ của một repo chính: đọc gitdir trong .git/worktrees, không spawn git. */
function linkedWorktrees(main) {
  const dir = path.join(main, '.git', 'worktrees')
  let names
  try { names = fs.readdirSync(dir) } catch { return [] }
  const out = []
  for (const n of names) {
    try {
      const g = fs.readFileSync(path.join(dir, n, 'gitdir'), 'utf8').trim()
      if (g) out.push(path.resolve(path.dirname(g)))
    } catch { /* bỏ qua mục hỏng */ }
  }
  return out
}

/** Quét repo; worktree phụ (có repo chính trong danh sách) được gom vào repo chính thay vì hiện riêng. linked: repo chính → các worktree. */
function scanRepos(roots, depth) {
  const found = new Set()
  const visit = (dir, level) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    if (entries.some((e) => e.name === '.git')) { found.add(dir); return }
    if (level >= depth) return
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.has(e.name)) visit(path.join(dir, e.name), level + 1)
    }
  }
  for (const r of roots) visit(r, 0)
  const linked = new Map()
  const hidden = new Set()
  for (const p of found) {
    const l = linkedWorktrees(p)
    if (l.length) { linked.set(p, l); for (const w of l) hidden.add(normPath(w)) }
  }
  return { paths: [...found].filter((p) => !hidden.has(normPath(p))).sort((a, b) => a.localeCompare(b)), linked }
}

const discover = (roots, depth) => scanRepos(roots, depth).paths

function repoPaths(force) {
  const cfg = loadConfig()
  if (force || !repoCache || Date.now() - repoCache.at > 5 * 60000) {
    repoCache = { at: Date.now(), ...scanRepos(cfg.roots, cfg.depth) }
  }
  return { cfg, at: repoCache.at, paths: repoCache.paths, linked: repoCache.linked }
}

function parseStatus(out) {
  const r = { branch: null, detached: false, head: '', upstream: null, ahead: 0, behind: 0, files: [] }
  for (const line of out.split('\n')) {
    if (!line) continue
    if (line.startsWith('# branch.head ')) {
      const v = line.slice(14)
      r.detached = v === '(detached)'
      r.branch = r.detached ? null : v
    } else if (line.startsWith('# branch.oid ')) r.head = line.slice(13, 20)
    else if (line.startsWith('# branch.upstream ')) r.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) { r.ahead = +m[1]; r.behind = +m[2] }
    } else if (line.startsWith('1 ')) {
      r.files.push({ path: line.split(' ').slice(8).join(' '), x: line[2], y: line[3], kind: 'change' })
    } else if (line.startsWith('2 ')) {
      r.files.push({ path: line.split(' ').slice(9).join(' ').split('\t')[0], x: line[2], y: line[3], kind: 'change' })
    } else if (line.startsWith('u ')) {
      r.files.push({ path: line.split(' ').slice(10).join(' '), x: line[2], y: line[3], kind: 'conflict' })
    } else if (line.startsWith('? ')) {
      r.files.push({ path: line.slice(2), x: '?', y: '?', kind: 'untracked' })
    }
  }
  return r
}

const counts = (files) => ({
  staged: files.filter((f) => f.kind === 'change' && f.x !== '.').length,
  modified: files.filter((f) => f.kind === 'change' && f.y !== '.').length,
  untracked: files.filter((f) => f.kind === 'untracked').length,
  conflicts: files.filter((f) => f.kind === 'conflict').length,
})

async function summarize(p, worktrees = 0) {
  const [st, br, last] = await Promise.all([
    git(p, ['status', '--porcelain=v2', '--branch']),
    git(p, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
    git(p, ['log', '-1', `--format=%aI${SEP}%s${SEP}%an`]),
  ])
  const base = { path: p, name: path.basename(p), worktrees }
  if (st === null) {
    const dotGit = path.join(p, '.git')
    const stub = fs.statSync(dotGit, { throwIfNoEntry: false })?.isDirectory() && !fs.existsSync(path.join(dotGit, 'HEAD'))
    return { ...base, error: stub ? 'Thư mục .git không hợp lệ (thiếu HEAD) — không phải repo thật' : 'Không đọc được trạng thái git (thiếu quyền, timeout hoặc repo hỏng)', branch: null, detached: false, head: '', upstream: null, ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, conflicts: 0, branches: [], lastCommit: null }
  }
  const s = parseStatus(st)
  const [date, subject, author] = (last || '').trim().split(SEP)
  return {
    ...base, branch: s.branch, detached: s.detached, head: s.head, upstream: s.upstream, ahead: s.ahead, behind: s.behind,
    ...counts(s.files),
    branches: (br || '').split('\n').filter(Boolean),
    lastCommit: date ? { date, subject, author } : null,
  }
}

async function pool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

const SCAN_FILE = path.join(path.dirname(CONFIG_FILE), 'scan.json')
const normPath = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Tóm tắt lần quét gần nhất (trang Tổng quan đọc cái này thay vì quét lại). */
function lastScan() {
  try { return JSON.parse(fs.readFileSync(SCAN_FILE, 'utf8')) } catch { return null }
}

function saveScan(cfg, repos, ms) {
  const roots = [...cfg.roots].sort((a, b) => b.length - a.length)
  const byRoot = Object.fromEntries(cfg.roots.map((r) => [r, 0]))
  for (const r of repos) {
    const p = normPath(r.path)
    const root = roots.find((x) => p.startsWith(normPath(x) + '/'))
    if (root) byRoot[root]++
  }
  try {
    fs.mkdirSync(path.dirname(SCAN_FILE), { recursive: true })
    fs.writeFileSync(SCAN_FILE, JSON.stringify({ at: new Date().toISOString(), ms, repos: repos.length, roots: cfg.roots, byRoot }))
  } catch { /* không để lỗi ghi làm hỏng việc quét */ }
}

async function listRepos(rescan) {
  const t0 = Date.now()
  const { cfg, paths, at, linked } = repoPaths(rescan)
  const repos = await pool(paths, 8, (p) => summarize(p, linked.get(p)?.length || 0))
  saveScan(cfg, repos, Date.now() - t0)
  return { roots: cfg.roots, depth: cfg.depth, scannedAt: new Date(at).toISOString(), repos }
}

/** Số dòng thêm/xóa theo tệp: { path: [add, del] }. Tệp nhị phân → [0, 0]. */
function parseNumstat(out) {
  const m = {}
  for (const line of (out || '').split('\n')) {
    const x = line.split('\t')
    if (x.length < 3) continue
    m[x.slice(2).join('\t')] = [x[0] === '-' ? 0 : +x[0], x[1] === '-' ? 0 : +x[1]]
  }
  return m
}

/** `git stash list --format=%gd␟%gs␟%cI` → { ref, message, at, branch }. Nhánh lấy từ "WIP on <nhánh>: …" / "On <nhánh>: …". */
function parseStashList(out) {
  return out.split('\n').filter(Boolean).map((l) => {
    const [ref, subject = '', at = ''] = l.split(SEP)
    const m = /^(?:WIP on|On) ([^:]*): ?(.*)$/.exec(subject)
    return { ref, message: m ? m[2] : subject, at, branch: m ? m[1] : null }
  })
}

/** `git worktree list --porcelain` → { path, branch, head, detached, bare, locked, prunable, main }. Mục đầu tiên là worktree chính. */
function parseWorktrees(out) {
  return out.split(/\r?\n\r?\n/).map((b) => b.trim()).filter(Boolean).map((block, i) => {
    const w = { path: '', branch: null, head: '', detached: false, bare: false, locked: false, prunable: false, main: i === 0 }
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) w.path = path.resolve(line.slice(9))
      else if (line.startsWith('HEAD ')) w.head = line.slice(5, 12)
      else if (line.startsWith('branch ')) w.branch = line.slice(7).replace(/^refs\/heads\//, '')
      else if (line === 'detached') w.detached = true
      else if (line === 'bare') w.bare = true
      else if (line === 'locked' || line.startsWith('locked ')) w.locked = true
      else if (line === 'prunable' || line.startsWith('prunable ')) w.prunable = true
    }
    return w
  }).filter((w) => w.path)
}

async function repoDetail(p) {
  const { paths } = repoPaths(false)
  if (!paths.includes(p)) throw new Error('Repo không nằm trong danh sách đã quét')
  const refFmt = ['%(refname)', '%(refname:short)', '%(HEAD)', '%(upstream:short)', '%(upstream:track)', '%(committerdate:iso-strict)', '%(subject)', '%(objectname:short)'].join(SEP)
  const [st, refs, log, remotes, stash, nsUnstaged, nsStaged, wtOut] = await Promise.all([
    git(p, ['status', '--porcelain=v2', '--branch']),
    git(p, ['for-each-ref', `--format=${refFmt}`, 'refs/heads', 'refs/remotes']),
    git(p, ['log', '-n', '20', `--format=%h${SEP}%an${SEP}%aI${SEP}%s`]),
    git(p, ['remote', '-v']),
    git(p, ['stash', 'list', `--format=%gd${SEP}%gs${SEP}%cI`]),
    git(p, ['diff', '--numstat', '--no-renames']),
    git(p, ['diff', '--cached', '--numstat', '--no-renames']),
    git(p, ['worktree', 'list', '--porcelain']),
  ])
  if (st === null) throw new Error('Không đọc được repo')
  const s = parseStatus(st)
  const branches = (refs || '').split('\n').filter(Boolean).map((l) => {
    const [ref, name, head, upstream, track, date, subject, sha] = l.split(SEP)
    const a = /ahead (\d+)/.exec(track), b = /behind (\d+)/.exec(track)
    return { name, remote: ref.startsWith('refs/remotes/'), current: head === '*', upstream: upstream || null, ahead: a ? +a[1] : 0, behind: b ? +b[1] : 0, gone: track === '[gone]', date, subject, sha }
  }).filter((b) => !b.name.endsWith('/HEAD'))
  const worktrees = parseWorktrees(wtOut || '')
  await pool(worktrees, 4, async (w) => {
    const o = w.prunable || w.bare ? null : await git(w.path, ['status', '--porcelain'])
    w.dirty = o === null ? null : o.split('\n').filter(Boolean).length
  })
  const rmap = new Map()
  for (const l of (remotes || '').split('\n').filter(Boolean)) {
    const [n, u] = l.split(/\s+/)
    if (!rmap.has(n)) rmap.set(n, u)
  }
  return {
    path: p, name: path.basename(p), branch: s.branch, detached: s.detached, head: s.head, upstream: s.upstream, ahead: s.ahead, behind: s.behind,
    ...counts(s.files), files: s.files, branches,
    commits: (log || '').split('\n').filter(Boolean).map((l) => { const [hash, author, date, subject] = l.split(SEP); return { hash, author, date, subject } }),
    remotes: [...rmap].map(([name, url]) => ({ name, url })),
    stashes: parseStashList(stash || ''),
    worktrees,
    numstat: { staged: parseNumstat(nsStaged), unstaged: parseNumstat(nsUnstaged) },
  }
}

/** Liệt kê thư mục con để chọn thư mục quét. dir rỗng: ổ đĩa (Windows) hoặc thư mục home. */
function browse(dir) {
  const home = os.homedir()
  if (!dir) {
    if (process.platform === 'win32') {
      const drives = []
      for (let c = 65; c <= 90; c++) { const d = String.fromCharCode(c) + ':' + path.sep; if (fs.existsSync(d)) drives.push({ name: d, path: d, isRepo: false }) }
      return { path: '', parent: null, home, dirs: drives }
    }
    dir = home
  }
  dir = path.resolve(dir)
  let st
  try { st = fs.statSync(dir) } catch { throw new Error('Không tìm thấy thư mục: ' + dir) }
  if (!st.isDirectory()) throw new Error('Không phải thư mục: ' + dir)
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { throw new Error('Không có quyền đọc thư mục: ' + dir) }
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('$'))
    .map((e) => { const p = path.join(dir, e.name); return { name: e.name, path: p, isRepo: fs.existsSync(path.join(p, '.git')) } })
    .sort((a, b) => a.name.localeCompare(b.name))
  const up = path.dirname(dir)
  return { path: dir, parent: up !== dir ? up : process.platform === 'win32' ? '' : null, home, isRepo: fs.existsSync(path.join(dir, '.git')), dirs }
}

/** Repo đã quét, hoặc worktree phụ của một repo đã quét (để mở VS Code / Terminal / Explorer ở đó). */
function knownRepo(p) {
  const { paths, linked } = repoPaths(false)
  if (paths.includes(p)) return p
  const n = normPath(String(p))
  for (const l of linked.values()) if (l.some((w) => normPath(w) === n)) return p
  throw new Error('Repo không nằm trong danh sách đã quét')
}

/** Danh sách repo đã quét (bộ nhớ đệm), cho module khác đối chiếu. */
function repoPathsInfo() { const r = repoPaths(false); return { paths: r.paths, worktrees: [...r.linked.values()].flat() } }

module.exports = { repoPathsInfo, lastScan, listRepos, repoDetail, loadConfig, saveConfig, knownRepo, browse }

let urlCache = null
/** Bắt buộc quét lại ở lần đọc kế tiếp (sau khi tạo / clone / xóa repo). */
function invalidate() { repoCache = null; urlCache = null }
/** URL các remote của mọi repo đã quét (cache 5 phút), để ghép repo local với project trên GitLab / GitHub. */
async function remoteUrlMap() {
  if (urlCache && Date.now() - urlCache.at < 5 * 60000) return urlCache.list
  const { paths } = repoPaths(false)
  const list = await pool(paths, 8, async (p) => {
    const out = await git(p, ['config', '--get-regexp', '^remote\..*\.url$'])
    return { path: p, name: path.basename(p), urls: (out || '').split('\n').map((l) => l.replace(/^\S+\s+/, '').trim()).filter(Boolean) }
  })
  urlCache = { at: Date.now(), list }
  return list
}

/** Tên nhánh local của một repo đã quét. */
async function localBranchNames(p) {
  knownRepo(p)
  return ((await git(p, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])) || '').split('\n').filter(Boolean)
}

module.exports.remoteUrlMap = remoteUrlMap
module.exports.localBranchNames = localBranchNames
module.exports.invalidate = invalidate
module.exports.parseStatus = parseStatus
module.exports.parseStashList = parseStashList
module.exports.parseWorktrees = parseWorktrees
module.exports.discover = discover
