export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Tiền tố phím tắt hiển thị: ⌘ trên macOS, "Ctrl+" còn lại. */
export const MOD = isMac ? '⌘' : 'Ctrl+'

/** Cầu nối với vỏ desktop (giai đoạn 6b). Chạy trong trình duyệt thì không có. */
export interface DesktopBridge {
  platform?: string
  pickFolder?: () => Promise<string[]>
  notify?: (title: string, body: string) => void
  setAttention?: (n: number) => void
  onCommand?: (fn: (cmd: string) => void) => () => void
  openVSCode?: (path: string) => void
  openTerminal?: (path: string) => void
  reveal?: (path: string) => void
  minimize?: () => void
  maximize?: () => void
  close?: () => void
}
export const bridge = (): DesktopBridge | undefined => (window as unknown as { devdeck?: DesktopBridge }).devdeck
/** Báo lỗi ra hệ thống khi cửa sổ không được xem (người dùng tắt được ở trang Tổng quan). */
export const notifyEnabled = () => { try { return localStorage.getItem('notify') !== '0' } catch { return true } }
export function systemNotify(title: string, body: string) { if (notifyEnabled()) bridge()?.notify?.(title, body) }
export const revealLabel = isMac ? 'Hiện trong Finder' : 'Hiện trong Explorer'

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
