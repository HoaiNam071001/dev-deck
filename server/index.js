const http = require('http')
const fs = require('fs')
const path = require('path')
const usage = require('./usage')
const { claudeAccount } = require('./usage/account')
const profiles = require('./usage/profiles')
const git = require('./git')
const gitActions = require('./git-actions')
const gitRepos = require('./git-repos')
const jobs = require('./jobs')
const reporter = require('./jobs/reporter')
const remotes = require('./remotes')

const PORT = Number(process.env.PORT) || 4317
const DIST = path.join(__dirname, '..', 'dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' }

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
const readBody = (req) => new Promise((resolve, reject) => {
  let s = ''
  req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy() })
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')) } catch (e) { reject(e) } })
})

async function api(req, res, url) {
  try {
    if (url.pathname === '/api/usage') return json(res, 200, usage.collect())
    if (url.pathname === '/api/account/claude') return json(res, 200, await claudeAccount(url.searchParams.get('dir') || ''))
    if (url.pathname === '/api/accounts/claude') {
      if (req.method !== 'POST') return json(res, 200, profiles.list())
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      const out = body.action === 'remove' ? profiles.remove(String(body.dir || '')) : profiles.add(String(body.dir || ''))
      usage.invalidate()
      return json(res, 200, out)
    }
    if (url.pathname === '/api/usage/sources') return json(res, 200, usage.sources())
    if (url.pathname === '/api/git/repos') return json(res, 200, await git.listRepos(url.searchParams.get('rescan') === '1'))
    if (url.pathname === '/api/git/repo') return json(res, 200, await git.repoDetail(url.searchParams.get('path') || ''))
    if (url.pathname === '/api/git/action') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      return json(res, 200, await gitActions.perform(git.knownRepo(String(body.path || '')), body))
    }
    if (url.pathname === '/api/git/repo-action') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      if (body.action === 'create') return json(res, 200, await gitRepos.createRepo(body))
      if (body.action === 'delete') return json(res, 200, await gitRepos.deleteRepo(body))
      return json(res, 400, { error: 'Hành động không hỗ trợ' })
    }
    if (url.pathname === '/api/git/clone') {
      if (req.method !== 'POST') return json(res, 200, gitRepos.cloneStatus(url.searchParams.get('id') || ''))
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      return json(res, 200, body.action === 'cancel' ? gitRepos.cancelClone(String(body.id || '')) : gitRepos.startClone(body))
    }
    if (url.pathname === '/api/jobs/config') {
      if (req.method === 'PUT') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
        return json(res, 200, jobs.saveConfig(await readBody(req)))
      }
      return json(res, 200, jobs.loadConfig())
    }
    if (url.pathname === '/api/jobs/reporter') {
      const tracked = jobs.loadConfig().folders
      if (req.method === 'POST') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
        return json(res, 200, await reporter.setup(await readBody(req), tracked))
      }
      return json(res, 200, await reporter.status(tracked))
    }
    if (url.pathname === '/api/jobs/install-reporter') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      return json(res, 200, jobs.installReporter(String((await readBody(req)).repo || '')))
    }
    if (url.pathname === '/api/jobs') return json(res, 200, await jobs.scan())
    if (url.pathname === '/api/jobs/stop') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      return json(res, 200, await jobs.stop(await readBody(req)))
    }
    if (url.pathname === '/api/remotes/accounts') {
      if (req.method !== 'POST') return json(res, 200, remotes.accounts())
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      if (body.action === 'remove') return json(res, 200, remotes.removeAccount(String(body.id || '')))
      if (body.action === 'setWrite') return json(res, 200, remotes.setWrite(String(body.id || ''), body.on === true))
      if (body.action === 'test') return json(res, 200, await remotes.testAccount(String(body.id || '')))
      return json(res, 200, await remotes.addAccount(body))
    }
    if (url.pathname === '/api/remotes/local-jobs') return json(res, 200, await remotes.localJobs({ account: url.searchParams.get('account') || '', project: url.searchParams.get('project') || '', branch: url.searchParams.get('branch') || '' }))
    if (url.pathname === '/api/remotes/act') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      return json(res, 200, await remotes.act(await readBody(req)))
    }
    if (url.pathname === '/api/remotes/crs') {
      const q = url.searchParams
      return json(res, 200, await remotes.listChangeRequests({ account: q.get('account') || 'all', scope: q.get('scope') || 'mine', state: q.get('state') || 'opened' }))
    }
    if (url.pathname === '/api/remotes/for-branch') return json(res, 200, await remotes.forBranch({ remotes: url.searchParams.getAll('remote'), branch: url.searchParams.get('branch') || '' }))
    if (url.pathname === '/api/remotes/branches') return json(res, 200, await remotes.branches({ account: url.searchParams.get('account') || '', project: url.searchParams.get('project') || '' }))
    if (url.pathname === '/api/remotes/pipelines') return json(res, 200, await remotes.pipelines({ account: url.searchParams.get('account') || '', project: url.searchParams.get('project') || '' }))
    if (url.pathname === '/api/remotes/pipeline-jobs') return json(res, 200, await remotes.pipelineJobs({ account: url.searchParams.get('account') || '', project: url.searchParams.get('project') || '', id: url.searchParams.get('id') || '' }))
    if (url.pathname === '/api/remotes/cr') return json(res, 200, await remotes.changeRequest(url.searchParams.get('key') || ''))
    // Trang Tổng quan: chỉ đọc file nhỏ, không quét repo, không đọc log token
    if (url.pathname === '/api/overview') return json(res, 200, { config: git.loadConfig(), scan: git.lastScan(), activity: gitActions.recentActivity(8) })
    if (url.pathname === '/api/git/browse') return json(res, 200, git.browse(url.searchParams.get('path') || ''))
    if (url.pathname === '/api/git/config') {
      if (req.method === 'PUT') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
        return json(res, 200, git.saveConfig(await readBody(req)))
      }
      return json(res, 200, git.loadConfig())
    }
    json(res, 404, { error: 'Không có API này' })
  } catch (e) {
    json(res, 400, { error: e.message })
  }
}

function serveStatic(res, pathname) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end('Chưa có bản build giao diện. Chạy "npm run build" (hoặc "npm run dev" khi phát triển).')
  }
  let file = path.normalize(path.join(DIST, pathname))
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'cache-control': file.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  fs.createReadStream(file).pipe(res)
}

/** Khởi động server; port 0 = cổng ngẫu nhiên. Trả về { server, port }. */
function start(port = PORT) {
  const server = http.createServer((req, res) => {
    // Chặn DNS rebinding: chỉ nhận Host là localhost
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end() }
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.startsWith('/api/')) return api(req, res, url)
    serveStatic(res, decodeURIComponent(url.pathname))
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

module.exports = { start }

if (require.main === module) start().then(({ port }) => console.log(`DevDeck: http://localhost:${port}`))
