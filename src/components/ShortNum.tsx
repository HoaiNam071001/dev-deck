import { short } from '../lib/format'

/** Số gọn (21,3M) với đơn vị K / M / B có màu riêng để lướt nhanh quy mô. */
export function ShortNum({ n }: { n: number }) {
  const s = short(n)
  const u = s.slice(-1)
  return /[KMB]/.test(u) ? <>{s.slice(0, -1)}<b className={'unit unit-' + u}>{u}</b></> : <>{s}</>
}
