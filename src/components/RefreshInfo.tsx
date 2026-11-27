import { Spinner } from './ui'
import { usePersisted } from '../lib/persist'

const p2 = (n: number) => String(n).padStart(2, '0')
const clock = (t: number) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` }
const dur = (ms: number) => (ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's')

const CHOICES = [0, 10, 15, 30, 60, 120, 300, 600]
const label = (s: number) => (s === 0 ? 'Tắt' : s < 60 ? s + ' giây' : s / 60 + ' phút')

/** Chu kỳ tự làm mới (ms) của một trang, nhớ qua lần mở sau; 0 = chỉ làm mới tay. */
export function useRefreshMs(page: string, defSec: number) {
  const [sec, setSec] = usePersisted<number>('refresh.' + page, defSec, (v) => typeof v === 'number' && CHOICES.includes(v))
  return [sec * 1000, sec, setSec] as const
}

/** Phần thanh trạng thái: lần tải gần nhất, thời gian tải, và chọn chu kỳ tự làm mới. */
export function RefreshInfo({ at, ms, loading, sec, onSec, onReload }: { at: number | null; ms: number | null; loading: boolean; sec: number; onSec: (s: number) => void; onReload?: () => void }) {
  return (
    <>
      <span className="sb-item" title="Dữ liệu được giữ trong cache; quay lại trang là hiện ngay rồi làm mới ngầm">
        {loading && <Spinner inline />}Tải lúc <span className="mono fg-soft">{at ? clock(at) : '—'}</span>{ms !== null && <span className="mono"> · {dur(ms)}</span>}
      </span>
      <span className="sb-end sb-item">
        {onReload && <button className="sb-btn" onClick={onReload} disabled={loading}>Làm mới</button>}
        <label className="sb-item">Tự làm mới
          <select aria-label="Chu kỳ tự làm mới" value={sec} onChange={(e) => onSec(Number(e.target.value))}>
            {CHOICES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </label>
      </span>
    </>
  )
}
