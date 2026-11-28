import { useEffect, type ReactNode } from 'react'
import { usePersisted } from '../lib/persist'
import { useResizable } from '../lib/useResizable'
import { Icon } from './ui'

export type DockMode = 'panel' | 'modal'

/** Chế độ khung chi tiết của một trang, nhớ ở `<pageKey>.detailMode`. */
export function useDockMode(pageKey: string, def: DockMode) {
  return usePersisted<DockMode>(`${pageKey}.detailMode`, def, (v) => v === 'panel' || v === 'modal')
}

type Props = {
  /** Tiền tố khóa nhớ: `<pageKey>.detailMode`, `<pageKey>.detailW` */
  pageKey: string
  mode: DockMode
  open: boolean
  onClose: () => void
  /** Nhãn cho trình đọc màn hình, vd "Chi tiết repo shop-web" */
  label: string
  minW?: number
  maxW?: number
  defW?: number
  children: ReactNode
}

/**
 * Khung chi tiết dùng chung: `panel` = cố định bên phải, kéo mép trái để đổi độ rộng (nhớ theo trang);
 * `modal` = cửa sổ nổi trong vùng trang, bấm nền hoặc Esc để đóng. Nút chuyển chế độ / đóng đặt ở đầu nội dung bằng `DockButtons`.
 */
export function DetailDock({ pageKey, mode, open, onClose, label, minW = 380, maxW = 720, defW = 460, children }: Props) {
  const { width, dragging, handleProps } = useResizable(`${pageKey}.detailW`, { min: minW, max: maxW, def: defW, edge: 'left', step: 20 })

  // Esc đóng cửa sổ nổi (trừ khi đang gõ: Esc trong ô nhập để bỏ chữ / đóng gợi ý)
  useEffect(() => {
    if (!open || mode !== 'modal') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, mode, onClose])

  if (!open) return null
  if (mode === 'modal') {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center p-8">
        <button className="absolute inset-0 border-0 bg-[rgba(8,9,10,.6)]" aria-label="Đóng chi tiết" tabIndex={-1} onClick={onClose} />
        <section role="dialog" aria-modal="true" aria-label={label}
          className="relative flex h-full max-h-[620px] w-full max-w-[860px] flex-col overflow-hidden rounded-xl border border-border-pop bg-surface-2 shadow-[0_24px_64px_rgba(0,0,0,.6)]">
          {children}
        </section>
      </div>
    )
  }
  return (
    <div className="relative flex-none" style={{ width }}>
      <div aria-label="Đổi độ rộng khung chi tiết" {...handleProps}
        className="group absolute top-0 bottom-0 -left-[3px] z-10 flex w-1.5 cursor-col-resize items-center justify-center">
        <span className={'h-7 w-0.5 rounded-sm group-hover:bg-primary group-focus-visible:bg-primary ' + (dragging ? 'bg-primary' : 'bg-border-pop')} />
      </div>
      <section aria-label={label} className="flex h-full flex-col border-l border-border bg-surface-2">{children}</section>
    </div>
  )
}

/** Nút chuyển panel ↔ cửa sổ nổi và nút đóng, đặt ở đầu khung chi tiết. */
export function DockButtons({ mode, onMode, onClose, className = 'icon-btn sm' }: { mode?: DockMode; onMode?: (m: DockMode) => void; onClose?: () => void; className?: string }) {
  const toPanel = mode === 'modal'
  const label = toPanel ? 'Chuyển sang khung bên phải' : 'Chuyển sang cửa sổ nổi'
  return (
    <>
      {onMode && mode && <button className={className} title={label} aria-label={label} onClick={() => onMode(toPanel ? 'panel' : 'modal')}><Icon name={toPanel ? 'panel' : 'modal'} size={13} /></button>}
      {onClose && <button className={className} title="Đóng chi tiết (Esc)" aria-label="Đóng chi tiết" onClick={onClose}><Icon name="x" size={13} /></button>}
    </>
  )
}
