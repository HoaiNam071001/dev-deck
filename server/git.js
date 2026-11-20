// Chỉ chạy các lệnh git ĐỌC (status, for-each-ref, log, remote, stash list).
// Lệnh ghi sẽ nằm ở server/git-actions.js (xem plan/03).
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'config.json')
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor', 'AppData', '.cache', '__pycache__', '.venv', 'venv'])
const SEP = '\x1f'

function defaults() {
  const env = process.env.GIT_ROOTS
  return { roots: env ? env.split(path.delimiter).filter(Boolean) : [path.join(os.homedir(), 'Desktop')], depth: 4 }
}

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    const d = defaults()
    return { roots: Array.isArray(c.roots) && c.roots.length ? c.roots : d.roots, depth: Number(c.depth) || d.depth }
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
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ roots, depth }, null, 2))
  repoCache = null
  return { roots, depth }
}

function git(cwd, args, timeout = 20000) {
  return new Promise((resolve) => {
    execFile('git', ['-c', 'core.quotepath=off', ...args], {
      cwd, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout) => resolve(err ? null : stdout))
  })
}

function discover(roots, depth) {
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
  return [...found].sort((a, b) => a.localeCompare(b))
}

function repoPaths(force) {
  const cfg = loadConfig()
  if (force || !repoCache || Date.now() - repoCache.at > 5 * 60000) {
    repoCache = { at: Date.now(), paths: discover(cfg.roots, cfg.depth) }
  }
  return { cfg, at: repoCache.at, paths: repoCache.paths }
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

async function summarize(p) {
  const [st, br, last] = await Promise.all([
    git(p, ['status', '--porcelain=v2', '--branch']),
    git(p, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
    git(p, ['log', '-1', `--format=%aI${SEP}%s${SEP}%an`]),
  ])
  const base = { path: p, name: path.basename(p) }
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

async function listRepos(rescan) {
  const { cfg, paths, at } = repoPaths(rescan)
  const repos = await pool(paths, 8, summarize)
  return { roots: cfg.roots, depth: cfg.depth, scannedAt: new Date(at).toISOString(), repos }
}

async function repoDetail(p) {
  const { paths } = repoPaths(false)
  if (!paths.includes(p)) throw new Error('Repo không nằm trong danh sách đã quét')
  const refFmt = ['%(refname)', '%(refname:short)', '%(HEAD)', '%(upstream:short)', '%(upstream:track)', '%(committerdate:iso-strict)', '%(subject)', '%(objectname:short)'].join(SEP)
  const [st, refs, log, remotes, stash] = await Promise.all([
    git(p, ['status', '--porcelain=v2', '--branch']),
    git(p, ['for-each-ref', `--format=${refFmt}`, 'refs/heads', 'refs/remotes']),
    git(p, ['log', '-n', '20', `--format=%h${SEP}%an${SEP}%aI${SEP}%s`]),
    git(p, ['remote', '-v']),
    git(p, ['stash', 'list']),
  ])
  if (st === null) throw new Error('Không đọc được repo')
  const s = parseStatus(st)
  const branches = (refs || '').split('\n').filter(Boolean).map((l) => {
    const [ref, name, head, upstream, track, date, subject, sha] = l.split(SEP)
    const a = /ahead (\d+)/.exec(track), b = /behind (\d+)/.exec(track)
    return { name, remote: ref.startsWith('refs/remotes/'), current: head === '*', upstream: upstream || null, ahead: a ? +a[1] : 0, behind: b ? +b[1] : 0, gone: track === '[gone]', date, subject, sha }
  }).filter((b) => !b.name.endsWith('/HEAD'))
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
    stashes: (stash || '').split('\n').filter(Boolean).length,
  }
}

module.exports = { listRepos, repoDetail, loadConfig, saveConfig }
