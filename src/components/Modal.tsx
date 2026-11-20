import { useEffect, useRef, type ReactNode } from 'react'

type ModalProps = {
  onClose: () => void
  /** Phần đầu (tiêu đề, meta). Nút đóng luôn nằm bên phải. */
  header: ReactNode
  titleId?: string
  children: ReactNode
}

/** Modal dùng chung: kích thước cố định, header dính, phần thân tự cuộn. */
export function Modal({ onClose, header, titleId = 'modal-title', children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => { if (d?.open) d.close() }
  }, [])
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="modal-head">
        <div className="modal-title">{header}</div>
        <button onClick={onClose} aria-label="Đóng">✕</button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
