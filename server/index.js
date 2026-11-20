const http = require('http')
const fs = require('fs')
const path = require('path')
const { collect } = require('./usage')
const git = require('./git')
const gitActions = require('./git-actions')

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
    if (url.pathname === '/api/usage') return json(res, 200, collect())
    if (url.pathname === '/api/git/repos') return json(res, 200, await git.listRepos(url.searchParams.get('rescan') === '1'))
    if (url.pathname === '/api/git/repo') return json(res, 200, await git.repoDetail(url.searchParams.get('path') || ''))
    if (url.pathname === '/api/git/action') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' })
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần application/json' })
      const body = await readBody(req)
      return json(res, 200, await gitActions.perform(git.knownRepo(String(body.path || '')), body))
    }
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

http.createServer((req, res) => {
  // Chặn DNS rebinding: chỉ nhận Host là localhost
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end() }
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) return api(req, res, url)
  serveStatic(res, decodeURIComponent(url.pathname))
}).listen(PORT, '127.0.0.1', () => console.log(`DevDeck: http://localhost:${PORT}`))
