import { useEffect, useRef, useState } from 'react'
import { api, useLoad } from '../api'
import { usePersisted } from '../lib/persist'
import { copyText } from '../lib/platform'
import { toast } from '../lib/store'
import type { ScriptRun } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { Spinner } from './ui'

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[([0-9;]*)m/g
const COLORS: Record<number, string> = { 31: 'var(--danger)', 32: 'var(--accent)', 33: 'var(--behind)', 34: 'var(--ahead)', 35: 'var(--untracked)', 36: 'var(--series-input)', 90: 'var(--fg-mute)' }

/** Mã màu ANSI cơ bản (đỏ, xanh, vàng…, đậm) thành span; mã khác bị bỏ. */
function Ansi({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let color: string | undefined, bold = false, last = 0, n = 0
  const flush = (to: number) => { const t = text.slice(last, to).replace(/\u001b\[[0-9;?]*[A-Za-ln-z]/g, ''); if (t) out.push(<span key={n++} style={{ color, fontWeight: bold ? 700 : undefined }}>{t}</span>) }
  for (const m of text.matchAll(ANSI)) {
    flush(m.index!)
    last = m.index! + m[0].length
    for (const c of (m[1] || '0').split(';').map(Number)) { if (c === 0 || c === 39) { color = undefined; if (c === 0) bold = false } else if (c === 1) bold = true; else if (COLORS[c]) color = COLORS[c] }
  }
  flush(text.length)
  return <>{out}</>
}

/** Log trực tiếp của một lần chạy (poll mỗi giây khi còn chạy), tự cuộn theo trừ khi người dùng cuộn lên. */
function RunLog({ id }: { id: string }) {
  const [find, setFind] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [run, setRun] = useState<ScriptRun | null>(null)
  const since = useRef(0)
  const box = useRef<HTMLPreElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    let alive = true
    let t: ReturnType<typeof setTimeout>
    since.current = 0
    setLines([])
    const tick = async () => {
      try {
        const r = await api.scriptLog(id, since.current)
        if (!alive) return
        since.current = r.from + r.lines.length
        if (r.lines.length) setLines((l) => [...l, ...r.lines].slice(-5000))
        setRun(r.run)
        if (!r.run.running) return
      } catch { /* thử lại ở lượt sau */ }
      t = setTimeout(tick, 1000)
    }
    tick()
    return () => { alive = false; clearTimeout(t) }
  }, [id])
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight }, [lines])
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1">
        <input className="h-[24px] min-w-0 flex-1 rounded-[5px] border border-border bg-transparent px-1.5 font-mono text-[11px] text-fg" placeholder="Tìm trong log" aria-label="Tìm trong log" value={find} onChange={(e) => setFind(e.target.value)} />
        <button className="btn sm" onClick={() => copyText(lines.map((l) => l.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')).join('\n'))}>Sao chép</button>
      </div>
      <pre ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24 }}
        className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap break-all bg-bg/60 px-3 py-2 font-mono text-[11px] leading-[1.5] text-fg">
        {lines.length ? lines.filter((l) => !find || l.toLowerCase().includes(find.toLowerCase())).map((l, i) => <div key={i}><Ansi text={l} /></div>) : run?.running === false ? '(không có đầu ra)' : 'Đang chờ đầu ra…'}
      </pre>
      {run && !run.running && <p className="m-0 px-3 py-1 text-[11px] text-fg-mute">Kết thúc, mã thoát <span className={'font-mono ' + (run.code === 0 ? 'text-accent' : 'text-danger')}>{run.code}</span></p>}
    </div>
  )
}

/** Tab Script: liệt kê script của package.json (kể cả package con), chạy, xem log, dừng. */
export function RepoScripts({ repoPath }: { repoPath: string }) {
  const pk = useLoad(() => api.scripts(repoPath), [repoPath])
  const runs = useLoad(() => api.scriptRuns(), [repoPath], 2000)
  const [open, setOpen] = useState<string | null>(null)
  const [pins, setPins] = usePersisted<string[]>('scripts.pins', [], Array.isArray)
  const [args, setArgs] = useState<Record<string, string>>({})
  const [again, setAgain] = useState<{ dir: string; script: string; id: string } | null>(null)
  const mine = (runs.data || []).filter((r) => r.repo === repoPath)
  const start = async (dir: string, script: string) => {
    try { const r = await api.runScript(repoPath, dir, script, args[dir + '#' + script] || ''); setOpen(r.id); runs.reload() } catch (e) { toast({ kind: 'err', title: (e as Error).message }) }
  }
  const stop = async (id: string) => { try { await api.stopScript(id) } catch (e) { toast({ kind: 'err', title: (e as Error).message }) } runs.reload() }
  const click = (dir: string, script: string) => {
    const cur = mine.find((r) => r.running && r.rel === dir && r.script === script)
    if (cur) setAgain({ dir, script, id: cur.id }); else start(dir, script)
  }
  if (pk.error) return <p className="px-4 py-3 text-sm text-danger">{pk.error}</p>
  if (!pk.data) return <Spinner label="Đang đọc package.json…" />
  if (!pk.data.packages.length) return <p className="px-4 py-3 text-sm text-fg-mute">Không thấy package.json có script nào trong repo này.</p>
  return (
    <div className="pb-3">
      {pk.data.packages.map((p) => (
        <section key={p.rel}>
          <h4 className="m-0 px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-fg-mute uppercase">{p.rel || p.name || '(gốc)'} <span className="font-mono normal-case">{p.manager}</span></h4>
          {Object.entries(p.scripts).sort(([a], [b]) => +pins.includes(repoPath + '|' + p.rel + '#' + b) - +pins.includes(repoPath + '|' + p.rel + '#' + a)).map(([name, cmd]) => {
            const k = p.rel + '#' + name
            const pk = repoPath + '|' + k
            const pinned = pins.includes(pk)
            const cur = mine.find((r) => r.running && r.rel === p.rel && r.script === name)
            return (
              <div key={k} className="flex items-center gap-2 px-4 py-1 hover:bg-selected">
                <button className="icon-btn sm" aria-pressed={pinned} title={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'} onClick={() => setPins(pinned ? pins.filter((x) => x !== pk) : [...pins, pk])}>{pinned ? '★' : '☆'}</button>
                <button className="btn sm" title={cur ? 'Đang chạy: bấm để chạy lại' : 'Chạy'} onClick={() => click(p.rel, name)}>{cur ? '↻' : '▶'}</button>
                <span className="w-[110px] flex-none truncate font-mono text-[12px]" title={name}>{name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-mute" title={cmd}>{cmd}</span>
                <input className="h-[24px] w-[120px] flex-none rounded-[5px] border border-border bg-transparent px-1.5 font-mono text-[11px] text-fg" placeholder="tham số" aria-label={'Tham số cho ' + name}
                  value={args[k] || ''} onChange={(e) => setArgs({ ...args, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') click(p.rel, name) }} />
              </div>
            )
          })}
        </section>
      ))}
      {mine.length > 0 && (
        <section>
          <h4 className="m-0 px-4 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-fg-mute uppercase">Lần chạy</h4>
          {mine.slice(0, 20).map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-2 px-4 py-1 hover:bg-selected">
                <button type="button" className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-mono text-[12px] text-fg" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {r.running ? '● ' : r.code === 0 ? '✓ ' : '✗ '}{r.rel ? r.rel + ' · ' : ''}{r.script} <span className="text-fg-mute">{new Date(r.start).toLocaleTimeString()}</span>
                </button>
                {r.running && r.port > 0 && <a className="font-mono text-[11px] text-primary" href={'http://localhost:' + r.port} target="_blank" rel="noreferrer">:{r.port} ↗</a>}
                {r.running && <button className="btn sm" onClick={() => stop(r.id)}>Dừng</button>}
              </div>
              {open === r.id && <RunLog id={r.id} />}
            </div>
          ))}
        </section>
      )}
      {again && (
        <ConfirmDialog title="Chạy lại script?" confirmLabel="Dừng và chạy lại" danger={false}
          onClose={() => setAgain(null)} onConfirm={async () => { const a = again; setAgain(null); await stop(a.id); await start(a.dir, a.script); return true }}>
          <p>"{again.script}" đang chạy. Dừng bản cũ và chạy lại?</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
