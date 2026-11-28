import { useCallback, useState } from 'react'
import { dragWidth, keyWidth, readWidth, type Edge } from './resize'

type Opts = { min: number; max: number; def: number; edge?: Edge; step?: number; fallbackKeys?: string[] }

const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k: string, w: number) => { try { localStorage.setItem(k, JSON.stringify(w)) } catch { /* bỏ qua */ } }

/**
 * Panel kéo đổi độ rộng, nhớ theo `key` (đổi key thì đọc lại giá trị của key mới).
 * `fallbackKeys`: khóa cũ đọc làm mặc định khi key mới chưa có giá trị.
 * Trả `handleProps` để gắn lên phần tử tay kéo (pointer, nhấp đúp về mặc định, ←/→/Home).
 */
export function useResizable(key: string, { min, max, def, edge = 'right', step = 16, fallbackKeys = [] }: Opts) {
  const load = () => readWidth(get, [key, ...fallbackKeys], min, max, def)
  // Giữ cả key trong state: đổi trang (đổi key) thì đọc độ rộng mới ngay trong lần render đó, không nháy độ rộng cũ
  const [st, setSt] = useState(() => ({ key, w: load() }))
  if (st.key !== key) setSt({ key, w: load() })
  const saved = st.key === key ? st.w : load()
  const [drag, setDrag] = useState<number | null>(null)
  const save = useCallback((w: number) => { setSt({ key, w }); put(key, w) }, [key])
  const width = drag ?? saved

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget, startX = e.clientX, startW = saved
    el.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    let last = startW
    const move = (ev: PointerEvent) => { last = dragWidth(startW, startX, ev.clientX, edge, min, max); setDrag(last) }
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''; document.body.style.cursor = ''
      save(last); setDrag(null)
    }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const w = keyWidth(saved, e.key, { edge, min, max, def, step })
    if (w !== null) { e.preventDefault(); save(w) }
  }

  return {
    width,
    dragging: drag !== null,
    handleProps: {
      role: 'separator' as const, 'aria-orientation': 'vertical' as const, tabIndex: 0,
      'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': width,
      title: 'Kéo để đổi độ rộng · bấm đúp để về mặc định',
      onPointerDown, onKeyDown, onDoubleClick: () => save(def),
    },
  }
}
