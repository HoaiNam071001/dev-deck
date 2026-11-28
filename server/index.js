const http = require('http')
const fs = require('fs')
const path = require('path')
const usage = require('./usage')
const aiDone = require('./usage/done')
const notifyConfig = require('./usage/notify-config')
const claudeHook = require('./usage/claude-hook')
const { claudeAccount } = require('./usage/account')
const profiles = require('./usage/profiles')
const git = require('./git')
const gitActions = require('./git-actions')
const gitRepos = require('./git-repos')
const gitBulk = require('./git-bulk')
const gitDiff = require('./git-diff')
const jobs = require('./jobs')
const reporter = require('./jobs/reporter')
const runner = require('./jobs/runner')
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

/** Cấu hình thông báo + các thư mục đã thấy trong log AI (để bật / tắt từng cái) + trạng thái hook Claude. */
function aiNotifyState(req) {
  const config = notifyConfig.load()
  const seen = new Map()
  for (const r of usage.collect()) {
    if (!r.projectPath) continue
    const k = notifyConfig.normPath(r.projectPath)
    const e = seen.get(k) || { path: r.projectPath, name: r.project, providers: new Set(), last: '' }
    e.providers.add(r.provider)
    if (r.t > e.last) e.last = r.t
    seen.set(k, e)
  }
  const projects = [...seen.values()].sort((a, b) => (a.last < b.last ? 1 : -1)).slice(0, 300)
    .map((e) => ({ path: e.path, name: e.name, providers: [...e.providers], last: e.last }))
  return { config, projects, hooks: claudeHook.status(req.socket.localPort) }
}

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
    if (url.pathname === '/api/ai/done') return json(res, 200, aiDone.since(Number(url.searchParams.get('since')) || 0))
    if (url.pathname === '/api/ai/notify') {
      if (req.method === 'PUT') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
        const c = notifyConfig.save(await readBody(req))
        gitActions.audit({ action: 'ai.notify.save', params: { enabled: c.enabled, rules: c.rules.length } })
      }
      return json(res, 200, aiNotifyState(req))
    }
    if (url.pathname === '/api/ai/hook/install') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      const dirs = body.dir === undefined ? profiles.dirs() : [profiles.resolve(String(body.dir))]
      for (const d of dirs) {
        let error
        try { body.action === 'uninstall' ? claudeHook.uninstall(d) : claudeHook.install(d, req.socket.localPort) } catch (e) { error = e }
        gitActions.audit({ action: 'ai.hook.' + (body.action === 'uninstall' ? 'uninstall' : 'install'), params: { dir: d }, ok: !error, error: error?.message })
        if (error) throw error
      }
      return json(res, 200, aiNotifyState(req))
    }
    if (url.pathname === '/api/ai/hook/stop') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!claudeHook.tokenOk(req.headers['x-devdeck-token'])) return json(res, 403, { error: 'Sai token' })
      aiDone.fromHook(await readBody(req))
      return json(res, 200, { ok: true })
    }
    if (url.pathname === '/api/usage/sources') return json(res, 200, usage.sources())
    if (url.pathname === '/api/git/repos') return json(res, 200, await git.listRepos(url.searchParams.get('rescan') === '1'))
    if (url.pathname === '/api/git/repo') return json(res, 200, await git.repoDetail(url.searchParams.get('path') || ''))
    if (url.pathname === '/api/git/diff') {
      const q = url.searchParams
      return json(res, 200, await gitDiff.fileDiff(git.knownRepo(q.get('path') || ''), { file: q.get('file') || '', kind: q.get('kind') || 'unstaged', ref: q.get('ref') || '' }))
    }
    if (url.pathname === '/api/git/stash') return json(res, 200, await gitDiff.stashFiles(git.knownRepo(url.searchParams.get('path') || ''), url.searchParams.get('ref') || ''))
    if (url.pathname === '/api/git/action') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      return json(res, 200, await gitActions.perform(git.knownRepo(String(body.path || '')), body))
    }
    if (url.pathname === '/api/git/bulk') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      if (body.action === 'pullPlan') return json(res, 200, await gitBulk.pullPlan(body.paths))
      if (body.action === 'pullRun') return json(res, 200, await gitBulk.pullRun(body.paths))
      if (body.action === 'cleanupPlan') return json(res, 200, await gitBulk.cleanupPlan(body.paths))
      if (body.action === 'cleanupRun') return json(res, 200, await gitBulk.cleanupRun(body.items, body.confirmCount))
      return json(res, 400, { error: 'Hành động không hỗ trợ' })
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
    if (url.pathname === '/api/jobs/scripts') return json(res, 200, runner.listPackages(url.searchParams.get('path') || ''))
    if (url.pathname === '/api/jobs/runs') return json(res, 200, runner.list())
    if (url.pathname === '/api/jobs/log') return json(res, 200, runner.log(url.searchParams.get('id') || '', url.searchParams.get('since') || '0'))
    if (url.pathname === '/api/jobs/run' || url.pathname === '/api/jobs/run-stop') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      return json(res, 200, url.pathname === '/api/jobs/run' ? runner.run(body) : await runner.stop(String(body.id || '')))
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
  aiDone.start()
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

module.exports = { start }

if (require.main === module) start().then(({ port }) => console.log(`DevDeck: http://localhost:${port}`))
