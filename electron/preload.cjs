// Cầu nối an toàn giữa giao diện và tiến trình chính (contextIsolation bật, không lộ Node).
// Chỉ phơi ra các hàm cụ thể; đường dẫn repo được tiến trình chính kiểm tra lại với danh sách đã quét.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('devdeck', {
  platform: process.platform,
  openVSCode: (p) => ipcRenderer.invoke('devdeck:openVSCode', p),
  openTerminal: (p) => ipcRenderer.invoke('devdeck:openTerminal', p),
  reveal: (p) => ipcRenderer.invoke('devdeck:reveal', p),
  pickFolder: () => ipcRenderer.invoke('devdeck:pickFolder'),
  notify: (title, body, target) => ipcRenderer.send('devdeck:notify', String(title), String(body || ''), target ? String(target) : ''),
  setAttention: (n) => ipcRenderer.send('devdeck:attention', Number(n) || 0),
  setReviewWaiting: (n) => ipcRenderer.send('devdeck:reviewWaiting', Number(n) || 0),
  minimize: () => ipcRenderer.send('devdeck:win', 'minimize'),
  maximize: () => ipcRenderer.send('devdeck:win', 'maximize'),
  close: () => ipcRenderer.send('devdeck:win', 'close'),
  version: () => ipcRenderer.invoke('devdeck:version'),
  updateStatus: () => ipcRenderer.invoke('devdeck:updateStatus'),
  updateCheck: () => ipcRenderer.invoke('devdeck:updateCheck'),
  updateInstall: () => ipcRenderer.invoke('devdeck:updateInstall'),
  onUpdateStatus: (fn) => {
    const h = (_e, s) => fn(s)
    ipcRenderer.on('devdeck:updateStatus', h)
    return () => ipcRenderer.removeListener('devdeck:updateStatus', h)
  },
  /** Lệnh từ khay hệ thống ('rescan'). Trả về hàm hủy đăng ký. */
  onCommand: (fn) => {
    const h = (_e, cmd) => fn(cmd)
    ipcRenderer.on('devdeck:command', h)
    return () => ipcRenderer.removeListener('devdeck:command', h)
  },
})
