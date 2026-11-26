// Cài reporter tiến độ vitest dùng chung cho nhiều project:
//  1) đặt gói "devdeck-reporter" vào <thư mục chọn>/node_modules (mọi project bên dưới tìm thấy theo tên);
//  2) (tùy chọn) đặt NODE_OPTIONS=--require=~/.devdeck/preload.cjs ở mức người dùng để "vitest run" tự có cờ --reporter.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const gitActions = require('../git-actions')

const DIR = path.join(os.homedir(), '.devdeck')
const STATE = path.join(DIR, 'reporter.json')
const PRELOAD = path.join(DIR, 'preload.cjs')
const SRC = path.join(__dirname, 'vitest-reporter.mjs')
const PRELOAD_SRC = path.join(__dirname, 'vitest-preload.cjs')
const PKG = 'devdeck-reporter'
const pkgDir = (folder) => path.join(folder, 'node_modules', PKG)

const read = (f) => { try { return fs.readFileSync(f, 'utf8') } catch { return null } }

/** Thư mục đã từng cài gói (để còn hiển thị / gỡ được dù không còn nằm trong thư mục theo dõi). */
function loadState() {
  try { const s = JSON.parse(fs.readFileSync(STATE, 'utf8')); if (Array.isArray(s.folders)) return s.folders.filter((x) => typeof x === 'string') } catch { /* chưa có */ }
  return []
}
function saveState(folders) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(STATE, JSON.stringify({ folders: [...new Set(folders)] }, null, 2))
}

/** none = chưa cài · ok = đã cài bản mới nhất · outdated = đã cài bản cũ. */
function packageState(folder) {
  const cur = read(path.join(pkgDir(folder), 'index.mjs'))
  if (cur === null) return 'none'
  return cur === read(SRC) ? 'ok' : 'outdated'
}

function checkFolder(p) {
  const f = path.resolve(String(p || ''))
  let st
  try { st = fs.statSync(f) } catch { throw new Error('Không tìm thấy thư mục: ' + f) }
  if (!st.isDirectory()) throw new Error('Không phải thư mục: ' + f)
  if (path.parse(f).root === f) throw new Error('Không cài vào gốc ổ đĩa: ' + f)
  if (f.split(path.sep).includes('node_modules')) throw new Error('Hãy chọn thư mục chứa các project, không phải bên trong node_modules')
  return f
}

function installPackage(folder) {
  const dir = pkgDir(folder)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(SRC, path.join(dir, 'index.mjs'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: PKG, version: '1.0.0', type: 'module', main: 'index.mjs', exports: './index.mjs', description: 'DevDeck: ghi tiến độ file test vitest' }, null, 2))
}

function removePackage(folder) {
  const dir = pkgDir(folder)
  // Chỉ xóa đúng thư mục gói của DevDeck, không đụng gì khác trong node_modules
  if (path.basename(dir) === PKG && fs.existsSync(path.join(dir, 'index.mjs'))) fs.rmSync(dir, { recursive: true, force: true })
}

// ---- NODE_OPTIONS (biến môi trường mức người dùng, chỉ Windows) ----
const ps = (script, env = {}) => new Promise((resolve, reject) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 20000, env: { ...process.env, ...env } }, (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())))
})
const getUserNodeOptions = () => (process.platform === 'win32' ? ps("[Environment]::GetEnvironmentVariable('NODE_OPTIONS','User')") : Promise.resolve(process.env.NODE_OPTIONS || ''))
const setUserNodeOptions = (value) => ps(
  "if ([string]::IsNullOrEmpty($env:DD_NODE_OPTIONS)) { [Environment]::SetEnvironmentVariable('NODE_OPTIONS', $null, 'User') } else { [Environment]::SetEnvironmentVariable('NODE_OPTIONS', $env:DD_NODE_OPTIONS, 'User') }",
  { DD_NODE_OPTIONS: value })

/** Mã cờ của DevDeck trong NODE_OPTIONS (đường dẫn có khoảng trắng thì bọc trong dấu nháy kép). */
const ourToken = () => '--require=' + (/\s/.test(PRELOAD) ? `"${PRELOAD}"` : PRELOAD)
const OURS_RE = /(^|\s)--require[= ]"?[^"\s]*[\\/]\.devdeck[\\/]preload\.cjs"?(?=\s|$)/g
const hasOurs = (v) => { OURS_RE.lastIndex = 0; return OURS_RE.test(v || '') }
/** Thêm hoặc bỏ cờ của DevDeck mà giữ nguyên phần còn lại người dùng đã đặt. */
const withOurs = (v, on) => {
  const rest = String(v || '').replace(OURS_RE, ' ').replace(/\s+/g, ' ').trim()
  return on ? (rest ? rest + ' ' : '') + ourToken() : rest
}

async function status(trackedFolders) {
  // Chuẩn hóa đường dẫn (C:/x và C:\x là một) để không hiện trùng
  const tracked = trackedFolders.map((p) => path.resolve(p))
  const known = [...new Set([...loadState().map((p) => path.resolve(p)), ...tracked])]
  const folders = known.map((p) => ({ path: p, state: fs.existsSync(p) ? packageState(p) : 'missing', tracked: tracked.includes(p) }))
  let nodeOptions = ''
  let error
  try { nodeOptions = (await getUserNodeOptions()) || '' } catch (e) { error = e.message }
  // Đang bật mà file nạp trước ở ~/.devdeck là bản cũ thì tự cập nhật (DevDeck sở hữu file này)
  if (hasOurs(nodeOptions) && read(PRELOAD) !== read(PRELOAD_SRC)) { try { fs.copyFileSync(PRELOAD_SRC, PRELOAD) } catch { /* giữ bản cũ */ } }
  return {
    supported: process.platform === 'win32', folders, nodeOptions, enabled: hasOurs(nodeOptions),
    preloadReady: read(PRELOAD) === read(PRELOAD_SRC) && read(PRELOAD) !== null, preload: PRELOAD, error,
  }
}

/** body: { action: 'install' | 'uninstall', folders: [...] } hoặc { action: 'enable' | 'disable' }. */
async function setup(body, trackedFolders) {
  const action = String(body.action || '')
  const log = (what, extra = {}) => gitActions.audit({ repo: extra.folder || PRELOAD, action: what, params: extra, ok: true })
  if (action === 'install' || action === 'uninstall') {
    const folders = (Array.isArray(body.folders) ? body.folders : []).map(checkFolder)
    if (!folders.length) throw new Error('Chưa chọn thư mục nào')
    let state = loadState()
    for (const f of folders) {
      if (action === 'install') { installPackage(f); state = [...state, f]; log('installReporter', { folder: f }) }
      else { removePackage(f); state = state.filter((x) => x !== f); log('removeReporter', { folder: f }) }
    }
    saveState(state)
  } else if (action === 'enable') {
    if (process.platform !== 'win32') throw new Error('Chỉ hỗ trợ Windows')
    fs.mkdirSync(DIR, { recursive: true })
    fs.copyFileSync(PRELOAD_SRC, PRELOAD)
    const cur = (await getUserNodeOptions()) || ''
    await setUserNodeOptions(withOurs(cur, true))
    log('enableNodeOptions', { before: cur })
  } else if (action === 'disable') {
    if (process.platform !== 'win32') throw new Error('Chỉ hỗ trợ Windows')
    const cur = (await getUserNodeOptions()) || ''
    await setUserNodeOptions(withOurs(cur, false))
    log('disableNodeOptions', { before: cur })
  } else throw new Error('Hành động không hỗ trợ: ' + action)
  return status(trackedFolders)
}

module.exports = { status, setup, _test: { withOurs, hasOurs, packageState, checkFolder, ourToken } }
