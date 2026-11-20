import { useCallback, useState } from 'react'

/** useState có lưu vào localStorage. `valid` lọc giá trị đã lưu (vd. bỏ giá trị cũ không còn hợp lệ). */
export function usePersisted<T>(key: string, initial: T, valid: (v: unknown) => boolean = () => true) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) { const v = JSON.parse(raw); if (valid(v)) return v as T }
    } catch { /* bỏ qua */ }
    return initial
  })
  const set = useCallback((v: T | ((p: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* bỏ qua */ }
      return next
    })
  }, [key])
  return [value, set] as const
}
