import { useId, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Spinner } from './ui'

/**
 * Hộp xác nhận cho thao tác khó hoàn tác. Có `confirmWord` thì phải gõ lại đúng chữ đó mới bấm được nút xác nhận.
 * `onConfirm` trả về true khi xong (hộp tự đóng), false khi thất bại (hộp ở lại để người dùng thử lại hoặc hủy).
 */
export function ConfirmDialog({ title, children, confirmLabel, danger = true, confirmWord, disabled, loading, onConfirm, onClose }: {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  confirmWord?: string
  /** Chặn nút xác nhận vì lý do khác (vd. đang tải thông tin, chưa nhập đủ). */
  disabled?: boolean
  loading?: boolean
  onConfirm: () => Promise<boolean> | boolean
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()
  const matches = !confirmWord || typed === confirmWord
  const submit = async () => {
    if (!matches || busy || disabled || loading) return
    setBusy(true)
    try { if (await onConfirm()) onClose() } finally { setBusy(false) }
  }
  return (
    <Modal size="sm" onClose={() => { if (!busy) onClose() }} titleId={id + 't'} header={<h2 id={id + 't'}>{title}</h2>}>
      <form className="flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        {loading ? <Spinner label="Đang kiểm tra…" /> : <div className="flex flex-col gap-2 text-[13px] text-fg-soft">{children}</div>}
        {confirmWord && (
          <label className="flex flex-col gap-1 text-sm text-fg-mute" htmlFor={id + 'w'}>
            Gõ <span className="font-mono text-fg">{confirmWord}</span> để xác nhận
            <input id={id + 'w'} className="font-mono" autoFocus autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Hủy</button>
          <button type="submit" className={'btn ' + (danger ? 'danger' : 'primary')} disabled={!matches || busy || disabled || loading}>
            {busy ? <><Spinner inline />Đang xử lý…</> : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
