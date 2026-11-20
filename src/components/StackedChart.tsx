import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, short } from '../lib/format'
import { KEYS, totalOf, type Bucket } from '../lib/usage'

const H = 220
const PAD = { l: 48, r: 8, t: 8, b: 42 }

export function StackedChart({ data, g }: { data: Bucket[]; g: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(800)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800))
    ro.observe(el)
    setW(el.clientWidth || 800)
    return () => ro.disconnect()
  }, [])

  const max = useMemo(() => Math.max(1, ...data.map(totalOf)), [data])
  if (!data.length) return <div className="empty">Không có dữ liệu trong khoảng này</div>

  const bw = (W - PAD.l - PAD.r) / data.length
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max)
  const step = Math.ceil(data.length / 8)
  const dayMode = g >= 1440
  const h = hover ? data[hover.i] : null

  return (
    <div ref={wrap} className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Biểu đồ token theo thời gian" onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (max * i) / 4
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="axis">{short(Math.round(v))}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          let acc = 0
          const x = PAD.l + i * bw + bw * 0.12, w = bw * 0.76, cx = x + w / 2
          const newDay = i === 0 || d.date !== data[i - 1].date
          const showTick = i % step === 0 || (!dayMode && newDay)
          return (
            <g key={d.b}>
              {KEYS.map(({ k, color }) => {
                const y0 = y(acc), y1 = y(acc + d[k])
                acc += d[k]
                return <rect key={k} x={x} y={y1} width={w} height={Math.max(0, y0 - y1)} style={{ fill: color }} />
              })}
              {!dayMode && newDay && i > 0 && <line x1={PAD.l + i * bw} x2={PAD.l + i * bw} y1={PAD.t} y2={H - PAD.b + 32} className="day-line" />}
              {showTick && (
                <>
                  <line x1={cx} x2={cx} y1={H - PAD.b} y2={H - PAD.b + 4} className="tick" />
                  <text x={cx} y={H - PAD.b + 17} textAnchor="middle" className={dayMode ? 'axis' : 'axis-strong'}>{dayMode ? d.date : d.time}</text>
                  {!dayMode && newDay && <text x={cx} y={H - PAD.b + 32} textAnchor="middle" className="axis-date">{d.date}</text>}
                </>
              )}
              <rect
                x={PAD.l + i * bw} y={PAD.t} width={bw} height={H - PAD.t - PAD.b} fill="transparent"
                onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
              />
            </g>
          )
        })}
      </svg>
      {hover && h && (
        <div className="tip" style={{ left: Math.min(hover.x + 12, window.innerWidth - 220), top: hover.y + 12 }}>
          <b>{h.date} {dayMode ? '' : h.time}</b>
          {KEYS.map(({ k, label, color }) => <div key={k} className="tip-r"><span><i style={{ background: color }} />{label}</span><span className="mono">{fmt(h[k])}</span></div>)}
          <div className="tip-r tip-t"><span>Tổng</span><span className="mono">{fmt(totalOf(h))}</span></div>
          <div className="tip-r"><span>Tin nhắn</span><span className="mono">{fmt(h.msgs)}</span></div>
        </div>
      )}
    </div>
  )
}
