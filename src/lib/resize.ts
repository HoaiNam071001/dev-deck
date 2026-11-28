/** Tính độ rộng panel khi kéo / bấm phím. Hàm thuần, dùng cho useResizable. */

/** Cạnh có tay kéo: 'right' = panel nằm bên trái (kéo phải để rộng ra), 'left' = panel nằm bên phải. */
export type Edge = 'left' | 'right'

export const clampWidth = (w: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(w)))

/** Độ rộng mới khi con trỏ đi từ startX tới x, bắt đầu từ startW. */
export function dragWidth(startW: number, startX: number, x: number, edge: Edge, min: number, max: number) {
  const dx = x - startX
  return clampWidth(edge === 'right' ? startW + dx : startW - dx, min, max)
}

/** Độ rộng mới khi bấm phím trên tay kéo; null = phím không dùng. Mũi tên đi theo hướng kéo, Home = mặc định. */
export function keyWidth(w: number, key: string, o: { edge: Edge; min: number; max: number; def: number; step: number }) {
  if (key === 'Home') return clampWidth(o.def, o.min, o.max)
  const dir = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  if (!dir) return null
  return clampWidth(w + (o.edge === 'right' ? dir : -dir) * o.step, o.min, o.max)
}

/** Đọc độ rộng đã lưu (giá trị lạ / ngoài khoảng thì bỏ), thử lần lượt các khóa. */
export function readWidth(get: (k: string) => string | null, keys: string[], min: number, max: number, def: number) {
  for (const k of keys) {
    try {
      const raw = get(k)
      if (raw === null) continue
      const v = JSON.parse(raw)
      if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) return Math.round(v)
    } catch { /* bỏ qua giá trị hỏng */ }
  }
  return def
}
