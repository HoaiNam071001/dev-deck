// Tiến trình chính của app desktop: chạy server DevDeck nội bộ (cổng ngẫu nhiên, chỉ 127.0.0.1) rồi mở cửa sổ trỏ tới nó.
const { app, BrowserWindow, shell, Menu, dialog } = require('electron')
const path = require('path')

// Dữ liệu (cấu hình, audit log) nằm ở thư mục người dùng, không mất khi cập nhật
process.env.DEVDECK_DATA = path.join(app.getPath('userData'), 'data')

let win = null
let httpServer = null

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })

async function createWindow() {
  const { start } = require('../server/index.js')
  // Chế độ dev: API cố định 4317 (Vite proxy /api về đó), giao diện lấy từ Vite để có hot reload
  const devUrl = process.env.DEVDECK_DEV_URL
  const { server, port } = await start(devUrl ? 4317 : 0)
  httpServer = server
  const origin = devUrl || `http://localhost:${port}`

  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600,
    backgroundColor: '#0f1013', autoHideMenuBar: true, title: 'DevDeck',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // Link ngoài mở bằng trình duyệt, không điều hướng cửa sổ app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url) } })
  await win.loadURL(origin + '/')
  win.on('closed', () => { win = null })
}

function setupUpdater() {
  if (!app.isPackaged) return
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(win ?? undefined, {
      type: 'info', buttons: ['Cập nhật ngay', 'Để sau'], defaultId: 0, cancelId: 1,
      title: 'Có bản mới', message: `DevDeck ${info.version} đã tải xong.`, detail: 'Khởi động lại để cài bản mới.',
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall() })
  })
  autoUpdater.on('error', (e) => console.error('update:', e?.message || e))
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  try { await createWindow() } catch (e) { dialog.showErrorBox('DevDeck không khởi động được', String(e?.message || e)); app.quit(); return }
  setupUpdater()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { httpServer?.close() })
