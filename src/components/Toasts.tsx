import { dismissToast, useStore } from '../lib/store'
import { Icon } from './ui'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" role="region" aria-label="Thông báo">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role={t.kind === 'err' ? 'alert' : 'status'}>
          <span className={'toast-ic ' + t.kind}><Icon name={t.kind === 'ok' ? 'check' : 'alert'} size={12} /></span>
          <span className="toast-body">
            <span className="toast-t">{t.title}</span>
            {t.detail && <span className="toast-d">{t.detail}</span>}
          </span>
          <button className="ghost" onClick={() => dismissToast(t.id)}>Đóng</button>
        </div>
      ))}
    </div>
  )
}
