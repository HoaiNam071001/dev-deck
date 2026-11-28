import { useEffect, useRef, useState } from 'react'
import { diffRows, hunkContext, hunkStats } from '../lib/diff'
import type { FileDiff } from '../types'
import { Kbd, Spinner } from './ui'

const ROW: Record<string, string> = { add: 'bg-accent/10', del: 'bg-danger/10', ctx: '', note: 'text-fg-mute italic' }
const SIGN: Record<string, string> = { add: '+', del: '−', ctx: ' ', note: '' }
const SIGN_COLOR: Record<string, string> = { add: 'text-accent', del: 'text-danger', ctx: '', note: '' }

export interface HunkAction { label: string; hint?: string; disabled?: boolean; busy?: boolean; run: (hash: string) => void }

/**
 * Hiển thị diff dạng unified: số dòng cũ / mới, màu +/−, gập từng hunk.
 * `active` là hunk đang chọn (phím tắt); `action` là nút stage / bỏ stage cho từng hunk (bỏ trống nếu chỉ xem).
 */
export function DiffView({ diff, loading, error, active = -1, onActive, action }: {
  diff: FileDiff | null
  loading?: boolean
  error?: string | null
  active?: number
  onActive?: (i: number) => void
  action?: HunkAction
}) {
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const refs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => { refs.current[active]?.scrollIntoView({ block: 'nearest' }) }, [active])
  useEffect(() => { setFolded(new Set()) }, [diff?.file, diff?.kind])

  if (error) return <p className="px-4 py-2 text-sm text-danger">{error}</p>
  if (!diff) return loading ? <Spinner label="Đang tải diff…" /> : null
  if (diff.tooLarge) return <p className="px-4 py-2 text-sm text-fg-mute">Diff quá lớn ({Math.round(diff.size / 1024)} KB), không hiển thị. Xem bằng công cụ khác.</p>
  if (diff.binary) return <p className="px-4 py-2 text-sm text-fg-mute">Tệp nhị phân, không có diff dạng chữ.</p>
  if (!diff.hunks.length) return <p className="px-4 py-2 text-sm text-fg-mute">Không có nội dung thay đổi để hiển thị.</p>

  const toggle = (hash: string) => setFolded((s) => { const n = new Set(s); if (!n.delete(hash)) n.add(hash); return n })
  return (
    <div className={'flex flex-col gap-1.5 px-2 pt-1 pb-2 ' + (loading ? 'opacity-60' : '')}>
      {diff.nonUtf8 && <p className="px-2 text-sm text-behind">Tệp không phải UTF-8: chỉ stage được cả tệp.</p>}
      {diff.hunks.map((h, i) => {
        const st = hunkStats(h), isFolded = folded.has(h.hash), ctx = hunkContext(h)
        return (
          <div key={h.hash} ref={(el) => { refs.current[i] = el }} onClick={() => onActive?.(i)}
            className={'overflow-hidden rounded-[5px] border ' + (i === active ? 'border-primary/60' : 'border-line')}>
            <div className="flex items-center gap-1.5 bg-selected/60 px-2 py-0.5 font-mono text-[11px]">
              <button type="button" className="ghost size-5 flex-none text-fg-mute" aria-expanded={!isFolded} aria-label={isFolded ? 'Mở hunk' : 'Gập hunk'} onClick={(e) => { e.stopPropagation(); toggle(h.hash) }}>{isFolded ? '▸' : '▾'}</button>
              <span className="min-w-0 flex-1 truncate text-fg-mute" title={h.header}>{h.header.match(/^@@[^@]*@@/)?.[0]} {ctx}</span>
              <span className="text-[10px]"><span className="text-accent">+{st.add}</span> <span className="text-danger">−{st.del}</span></span>
              {action && (
                <button type="button" className="btn sm" disabled={action.disabled || action.busy} onClick={(e) => { e.stopPropagation(); action.run(h.hash) }}>
                  {action.busy && i === active ? <Spinner inline /> : action.label}{i === active && action.hint && <> <Kbd>{action.hint}</Kbd></>}
                </button>
              )}
            </div>
            {!isFolded && (
              <div className="overflow-x-auto">
                <div className="min-w-max font-mono text-[12px] leading-[1.5]">
                  {diffRows(h).map((r, k) => (
                    <div key={k} className={'grid grid-cols-[3rem_3rem_1.25rem_1fr] ' + ROW[r.kind]}>
                      <span className="pr-2 text-right text-fg-mute select-none">{r.old ?? ''}</span>
                      <span className="pr-2 text-right text-fg-mute select-none">{r.new ?? ''}</span>
                      <span className={'text-center select-none ' + SIGN_COLOR[r.kind]}>{SIGN[r.kind]}</span>
                      <span className="pr-3 whitespace-pre">{r.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
