import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = { sep: true } | { label: string; key?: string; danger?: boolean; disabled?: boolean; run: () => void }

/** Menu nổi gắn vào phần tử cha (position: relative). Đóng khi bấm ra ngoài hoặc nhấn Esc; ↑↓ chọn mục. */
export function ContextMenu({ items, onClose, label, up, children }: { items: MenuItem[]; onClose: () => void; label: string; up?: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)
  // Hết chỗ phía dưới thì mở lên trên
  useLayoutEffect(() => { const r = ref.current?.getBoundingClientRect(); if (r && r.bottom > window.innerHeight - 28) setFlip(true) }, [])
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const i = btns.indexOf(document.activeElement as HTMLButtonElement)
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus()
      }
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true) }
  }, [onClose])
  return (
    <div ref={ref} className="menu" role="menu" aria-label={label} style={up || flip ? { top: 'auto', bottom: 40 } : undefined}>
      {items.map((m, i) => 'sep' in m
        ? <div key={i} className="menu-sep" role="separator" />
        : <button key={i} role="menuitem" className={'menu-item' + (m.danger ? ' danger' : '')} disabled={m.disabled} onClick={() => { onClose(); m.run() }}>
            {m.label}{m.key && <span className="menu-key">{m.key}</span>}
          </button>)}
      {children}
    </div>
  )
}
