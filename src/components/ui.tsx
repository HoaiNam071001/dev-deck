import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  home: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  ai: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  git: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10M18 9c0 5-7 4-11 8" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  dots: <><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></>,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  terminal: <path d="m5 8 4 4-4 4M12 17h7" />,
  sort: <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  check: <path d="m5 12 5 5 9-10" />,
  alert: <path d="M12 8v5M12 17h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  pin: <path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /></>,
  modal: <><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="7" y="8" width="10" height="8" rx="1" /></>,
  merge: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="15" r="2" /><path d="M6 7v10M18 13V9a3 3 0 0 0-3-3h-4M13 3l-2 3 2 3" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />,
}

export function Icon({ name, size = 14, fill, spin }: { name: keyof typeof PATHS | string; size?: number; fill?: boolean; spin?: boolean }) {
  return (
    <svg className={spin ? 'spin' : undefined} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={name === 'check' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

/** `inline`: vòng xoay nhỏ đặt cạnh chữ / trong nút; mặc định là khối căn giữa cho vùng đang tải. */
export function Spinner({ label, inline }: { label?: string; inline?: boolean }) {
  if (inline) return <span className="spinner sm" role="status" aria-label={label ?? 'Đang tải'} />
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label && <span className="muted">{label}</span>}
    </div>
  )
}

/** Banner lỗi dùng chung: đọc được bằng trình đọc màn hình, có nút "Thử lại" khi truyền `onRetry`. */
export function ErrorBanner({ children, onRetry, className = '' }: { children: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div className={'banner err flex items-center gap-3 ' + className} role="alert">
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && <button type="button" className="btn sm flex-none" onClick={onRetry}>Thử lại</button>}
    </div>
  )
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>

export type Tone = 'ok' | 'ahead' | 'behind' | 'danger' | 'muted' | 'info' | 'purple'
/** Nhãn trạng thái nhỏ: nền nhạt cùng tông với chữ. */
export function Chip({ tone, title, children }: { tone: Tone; title?: string; children: ReactNode }) {
  return <span className={'chip chip-' + tone} title={title}>{children}</span>
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; label: string
  options: { id: T; label: string; count?: number | string }[]
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}{o.count !== undefined && <span className="seg-n">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Dropdown lọc có nhãn phía trước, thay cho nhóm nút khi có nhiều lựa chọn. */
export function Select<T extends string>({ value, onChange, options, label, prefix }: {
  value: T; onChange: (v: T) => void; label: string; prefix?: string
  options: { id: T; label: string }[]
}) {
  return (
    <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-fg-mute">
      {prefix}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function ShareBar({ pct, color = 'var(--ahead)' }: { pct: number; color?: string }) {
  return <span className="share"><span style={{ width: Math.max(0, Math.min(100, pct)) + '%', background: color }} /></span>
}

export function KpiStrip({ children, label }: { children: ReactNode; label: string }) {
  return <section className="kpi-strip" aria-label={label}>{children}</section>
}
export function Kpi({ label, value, sub, valueColor, children }: { label: string; value: ReactNode; sub?: ReactNode; valueColor?: string; children?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="kpi-l">{label}</span>
      <span className="kpi-v" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
      {sub !== undefined && <span className="kpi-s">{sub}</span>}
      {children}
    </div>
  )
}

export const NavLabel = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="nav-label"><span>{children}</span>{action}</div>
)
