// Tiến trình chính của app desktop: chạy server DevDeck nội bộ (cổng ngẫu nhiên, chỉ 127.0.0.1) rồi mở cửa sổ không viền trỏ tới nó.
const { app, BrowserWindow, shell, Menu, dialog, ipcMain, Tray, Notification, nativeImage, screen, safeStorage } = require('electron')
const { execFile, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// Dữ liệu (cấu hình, audit log) nằm ở thư mục người dùng, không mất khi cập nhật
process.env.DEVDECK_DATA = path.join(app.getPath('userData'), 'data')

let win = null
let tray = null
let httpServer = null
let attention = 0
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => showWindow())

function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
}

// ---- Nhớ vị trí và kích thước cửa sổ ----
function loadBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    const ok = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return s.x >= a.x - 20 && s.y >= a.y - 20 && s.x < a.x + a.width - 100 && s.y < a.y + a.height - 100
    })
    return { width: s.width, height: s.height, ...(ok ? { x: s.x, y: s.y } : {}), maximized: !!s.maximized }
  } catch { return { width: 1280, height: 800, maximized: false } }
}
function saveBounds() {
  if (!win) return
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })) } catch { /* bỏ qua */ }
}

// ---- Thao tác hệ thống: chỉ nhận đường dẫn nằm trong danh sách repo đã quét, không qua shell của người dùng ----
function knownRepo(p) {
  if (typeof p !== 'string') throw new Error('Đường dẫn không hợp lệ')
  return require('../server/git.js').knownRepo(p)
}
// cmd.exe diễn giải các ký tự này, nên từ chối thay vì cố thoát chuỗi
const UNSAFE_FOR_CMD = /[&|<>^%"\r\n]/

function openVSCode(dir) {
  if (process.platform === 'win32') {
    if (UNSAFE_FOR_CMD.test(dir)) throw new Error('Tên thư mục có ký tự đặc biệt, hãy mở VS Code thủ công')
    execFile('cmd.exe', ['/c', 'code', dir], { windowsHide: true }, () => {})
  } else execFile('code', [dir], () => {})
}
function openTerminal(dir) {
  if (process.platform === 'win32') {
    const t = spawn('wt.exe', ['-d', dir], { detached: true, stdio: 'ignore' })
    t.on('error', () => spawn('cmd.exe', ['/c', 'start', 'cmd.exe'], { cwd: dir, detached: true, stdio: 'ignore' }).unref())
    t.unref()
  } else if (process.platform === 'darwin') execFile('open', ['-a', 'Terminal', dir], () => {})
  else spawn('x-terminal-emulator', [], { cwd: dir, detached: true, stdio: 'ignore' }).unref()
}

function setupIpc() {
  const guard = (fn) => async (_e, p) => { try { fn(knownRepo(p)) } catch (e) { return String(e.message || e) } }
  ipcMain.handle('devdeck:version', () => app.getVersion())
  ipcMain.handle('devdeck:openVSCode', guard(openVSCode))
  ipcMain.handle('devdeck:openTerminal', guard(openTerminal))
  ipcMain.handle('devdeck:reveal', guard((d) => shell.showItemInFolder(d)))
  ipcMain.handle('devdeck:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục quét', properties: ['openDirectory', 'multiSelections'] })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.on('devdeck:win', (e, cmd) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (cmd === 'minimize') w.minimize()
    else if (cmd === 'maximize') w.isMaximized() ? w.unmaximize() : w.maximize()
    else if (cmd === 'close') w.close()
  })
  ipcMain.on('devdeck:notify', (_e, title, body) => {
    // Chỉ báo khi cửa sổ không đang được xem; việc bật/tắt do giao diện quyết định
    if (win && win.isFocused()) return
    if (Notification.isSupported()) new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300) }).show()
  })
  ipcMain.on('devdeck:attention', (_e, n) => { attention = Math.max(0, n | 0); updateTray() })
}

// ---- Khay hệ thống ----
function trayIcon() {
  const size = 16, buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) { buf[i * 4] = 0x43; buf[i * 4 + 1] = 0xcf; buf[i * 4 + 2] = 0x30; buf[i * 4 + 3] = 0xff } // BGRA: #30CF43
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}
function updateTray() {
  if (!tray) return
  tray.setToolTip(attention ? `DevDeck · ${attention} repo cần chú ý` : 'DevDeck')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mở DevDeck', click: showWindow },
    { label: `Repo cần chú ý: ${attention}`, enabled: false },
    { label: 'Quét lại', click: () => { showWindow(); win?.webContents.send('devdeck:command', 'rescan') } },
    { type: 'separator' },
    { label: 'Thoát', click: () => app.quit() },
  ]))
}

async function createWindow() {
  const { start } = require('../server/index.js')
  // Token GitLab / GitHub được mã hóa bằng khóa của hệ điều hành (DPAPI / Keychain) khi có thể
  if (safeStorage.isEncryptionAvailable()) require('../server/remotes').setCrypto({ encrypt: (t) => safeStorage.encryptString(t), decrypt: (b) => safeStorage.decryptString(b) })
  // Chế độ dev: API cố định 4317 (Vite proxy /api về đó), giao diện lấy từ Vite để có hot reload
  const devUrl = process.env.DEVDECK_DEV_URL
  const { server, port } = await start(devUrl ? 4317 : 0)
  httpServer = server
  const origin = devUrl || `http://localhost:${port}`

  const b = loadBounds()
  const mac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: b.width, height: b.height, x: b.x, y: b.y, minWidth: 1100, minHeight: 700,
    backgroundColor: '#151719', title: 'DevDeck',
    // Windows/Linux: không viền, giao diện tự vẽ nút; macOS: giữ 3 nút tròn hệ thống
    frame: false, ...(mac ? { frame: true, titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 12 } } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  })
  if (b.maximized) win.maximize()
  win.on('close', saveBounds)
  // Link ngoài mở bằng trình duyệt, không điều hướng cửa sổ app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url) } })
  await win.loadURL(origin + '/')
  win.on('closed', () => { win = null })
}

// Trạng thái cập nhật gửi cho giao diện: { state: 'idle'|'checking'|'none'|'downloading'|'ready'|'error'|'unsupported', version?, percent?, message? }
let updateStatus = { state: 'idle' }
let manualCheck = false
function setUpdateStatus(s) {
  updateStatus = s
  win?.webContents.send('devdeck:updateStatus', s)
}

function setupUpdater() {
  ipcMain.handle('devdeck:updateStatus', () => updateStatus)
  if (!app.isPackaged) {
    // Bản chạy từ mã nguồn (npm run desktop/dev) không tự cập nhật được
    updateStatus = { state: 'unsupported' }
    ipcMain.handle('devdeck:updateCheck', () => updateStatus)
    ipcMain.handle('devdeck:updateInstall', () => {})
    return
  }
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => setUpdateStatus({ state: 'none' }))
  autoUpdater.on('update-available', (info) => setUpdateStatus({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => setUpdateStatus({ state: 'downloading', version: updateStatus.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => {
    setUpdateStatus({ state: 'ready', version: info.version })
    // Kiểm tra nền thì hỏi luôn; người dùng tự bấm kiểm tra thì đã thấy nút cài trong giao diện
    if (manualCheck) return
    dialog.showMessageBox(win ?? undefined, {
      type: 'info', buttons: ['Cập nhật ngay', 'Để sau'], defaultId: 0, cancelId: 1,
      title: 'Có bản mới', message: `DevDeck ${info.version} đã tải xong.`, detail: 'Khởi động lại để cài bản mới.',
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall() })
  })
  autoUpdater.on('error', (e) => {
    console.error('update:', e?.message || e)
    setUpdateStatus({ state: 'error', message: String(e?.message || e).split('\n')[0].slice(0, 200) })
  })
  ipcMain.handle('devdeck:updateCheck', async () => {
    // Đang tải hoặc đã tải xong thì không kiểm tra lại
    if (updateStatus.state === 'checking' || updateStatus.state === 'downloading' || updateStatus.state === 'ready') return updateStatus
    manualCheck = true
    try { await autoUpdater.checkForUpdates() } catch { /* sự kiện 'error' đã báo */ }
    return updateStatus
  })
  ipcMain.handle('devdeck:updateInstall', () => { if (updateStatus.state === 'ready') autoUpdater.quitAndInstall() })
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  setupIpc()
  try { await createWindow() } catch (e) { dialog.showErrorBox('DevDeck không khởi động được', String(e?.message || e)); app.quit(); return }
  tray = new Tray(trayIcon())
  tray.on('click', showWindow)
  updateTray()
  setupUpdater()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { httpServer?.close() })
