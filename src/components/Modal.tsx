import { useEffect, useRef, type ReactNode } from 'react'

type ModalProps = {
  onClose: () => void
  /** Phần đầu (tiêu đề, meta). Nút đóng luôn nằm bên phải. */
  header: ReactNode
  titleId?: string
  /** 'wide': gần kín cửa sổ, cho nội dung nhiều cột (vd. chi tiết MR) */
  size?: 'default' | 'wide'
  children: ReactNode
}

/** Modal dùng chung: kích thước cố định, header dính, phần thân tự cuộn. */
export function Modal({ onClose, header, titleId = 'modal-title', size = 'default', children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => { if (d?.open) d.close() }
  }, [])
  return (
    <dialog ref={ref} className={size === 'wide' ? 'modal modal-wide' : 'modal'} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="modal-head">
        <div className="modal-title">{header}</div>
        <button onClick={onClose} aria-label="Đóng">✕</button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
