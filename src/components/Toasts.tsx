import { useEffect, useRef } from 'react'
import { dismissToast, useStore } from '../lib/store'
import { Icon } from './ui'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const ref = useRef<HTMLDivElement>(null)
  // Modal dùng showModal() nên nằm ở top layer, z-index không vượt được. Toast là popover (cũng top layer);
  // hiện lại mỗi khi có toast mới để nó nằm trên modal đang mở.
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null
    if (!el?.showPopover) return
    try {
      if (el.matches(':popover-open')) el.hidePopover?.()
      if (toasts.length) el.showPopover()
    } catch { /* trình duyệt không hỗ trợ: toast vẫn hiện bằng z-index */ }
  }, [toasts])
  return (
    <div ref={ref} className="toasts" role="region" aria-label="Thông báo" {...({ popover: 'manual' } as object)}>
      {toasts.map((t) => (
        <div key={t.id} className="toast" role={t.kind === 'err' ? 'alert' : 'status'}>
          <span className={'toast-ic ' + t.kind}><Icon name={t.kind === 'ok' ? 'check' : 'alert'} size={12} /></span>
          {t.onOpen ? (
            <button className="toast-body toast-open" title="Bấm để mở" onClick={() => { dismissToast(t.id); t.onOpen!() }}>
              <span className="toast-t">{t.title}</span>
              {t.detail && <span className="toast-d">{t.detail}</span>}
            </button>
          ) : (
            <span className="toast-body">
              <span className="toast-t">{t.title}</span>
              {t.detail && <span className="toast-d">{t.detail}</span>}
            </span>
          )}
          <button className="ghost" onClick={() => dismissToast(t.id)}>Đóng</button>
        </div>
      ))}
    </div>
  )
}
