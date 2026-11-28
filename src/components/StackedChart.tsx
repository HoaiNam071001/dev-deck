import { useEffect, useMemo, useRef, useState } from 'react'
import { axisParts, fmt } from '../lib/format'
import { KEYS, PROVIDERS, totalOf, type Bucket } from '../lib/usage'

export interface Series { k: string; label: string; color: string }

const H = 220
const PAD = { l: 48, r: 8, t: 8, b: 42 }

export function StackedChart({ data, g, by = 'type', series }: { data: Bucket[]; g: number; by?: 'type' | 'provider' | 'project' | 'line'; series?: Series[] }) {
  const keys: Series[] =
    (by === 'project' || by === 'line') && series ? series : by === 'provider' ? PROVIDERS.map((p) => ({ k: p.id, label: p.label, color: p.color })) : [...KEYS]
  const val = (d: Bucket, k: string) => by === 'project' || by === 'line' ? (d.bySeries[k] ?? 0) : (k in d.byProvider ? d.byProvider[k as keyof Bucket['byProvider']] : (d as unknown as Record<string, number>)[k])
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

  const max = useMemo(() => Math.max(1, ...(by === 'line' ? data.flatMap((d) => keys.map(({ k }) => d.bySeries[k] ?? 0)) : data.map(totalOf))), [data, by, series]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data.length) return <div className="empty">Không có dữ liệu trong khoảng này</div>

  const bw = (W - PAD.l - PAD.r) / data.length
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max)
  const step = Math.ceil(data.length / 8)
  const dayMode = g >= 1440
  const h = hover ? data[hover.i] : null
  const line = by === 'line'
  const cxOf = (i: number) => PAD.l + i * bw + bw / 2

  return (
    <div ref={wrap} className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Biểu đồ token theo thời gian, ${data.length} mốc, cao nhất ${fmt(max)} token`} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (max * i) / 4
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="axis">{(() => {
                const [num, unit] = axisParts(Math.round(v))
                return <>{num}{unit && <tspan className={'unit-svg unit-svg-' + unit}>{unit}</tspan>}</>
              })()}</text>
            </g>
          )
        })}
        {line && keys.map(({ k, color }) => (
          <polyline key={k} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${cxOf(i)},${y(d.bySeries[k] ?? 0)}`).join(' ')} />
        ))}
        {line && hover && <line x1={cxOf(hover.i)} x2={cxOf(hover.i)} y1={PAD.t} y2={H - PAD.b} className="day-line" />}
        {data.map((d, i) => {
          let acc = 0
          const x = PAD.l + i * bw + bw * 0.12, w = bw * 0.76, cx = x + w / 2
          const newDay = i === 0 || d.date !== data[i - 1].date
          const showTick = i % step === 0 || (!dayMode && newDay)
          return (
            <g key={d.b}>
              {!line && keys.map(({ k, color }) => {
                const y0 = y(acc), y1 = y(acc + val(d, k))
                acc += val(d, k)
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
          {keys.map(({ k, label, color }) => <div key={k} className="tip-r"><span><i style={{ background: color }} />{label}</span><span className="mono">{fmt(val(h, k))}</span></div>)}
          <div className="tip-r tip-t"><span>Tổng</span><span className="mono">{fmt(line ? keys.reduce((n, { k }) => n + val(h, k), 0) : totalOf(h))}</span></div>
          <div className="tip-r"><span>Tin nhắn</span><span className="mono">{fmt(h.msgs)}</span></div>
        </div>
      )}
    </div>
  )
}
