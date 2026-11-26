import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { api, useLoad } from '../api'
import { FolderPicker } from '../components/FolderPicker'
import { Modal } from '../components/Modal'
import { ReporterSetup } from '../components/ReporterSetup'
import { SideSlot, StatusSlot } from '../components/Shell'
import { Chip, Icon, NavLabel, Segmented, Spinner, type Tone } from '../components/ui'
import { usePersisted } from '../lib/persist'
import { bridge } from '../lib/platform'
import { baseName } from '../lib/repo'
import { toast } from '../lib/store'
import type { Job, JobKind, JobPort, JobProgress } from '../types'

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const mb = (n: number) => (n >= 1 << 30 ? (n / (1 << 30)).toFixed(1) + ' GB' : Math.round(n / (1 << 20)) + ' MB')
function runtime(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return s + ' giây'
  if (s < 3600) return Math.floor(s / 60) + ' phút'
  return Math.floor(s / 3600) + ' giờ ' + Math.floor((s % 3600) / 60) + ' phút'
}
/** Thư mục chạy job, rút gọn theo repo: "(gốc repo)" hoặc "src/app". */
const relDir = (j: Job) => {
  const rel = j.cwd.slice(j.repo.length).replace(/^[\\/]+/, '').replace(/\\/g, '/')
  return rel || '(gốc repo)'
}
const BUSY = 1

/** Rút gọn dòng lệnh để dễ đọc: bỏ đường dẫn exe/script dài, gộp danh sách file test. Bản đầy đủ nằm ở tooltip và nút Chép. */
function shortCmd(cmd: string): string {
  const toks = (cmd.match(/"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/^"|"$/g, ''))
  const base = (t: string) => t.split(/[\\/]/).pop() ?? t
  const prog = (t: string) => base(t).replace(/(-cli)?\.(exe|cmd|mjs|cjs|js)$/i, '')
  if (!toks.length) return ''
  let i = 0
  const head: string[] = []
  if (/^node(\.exe)?$/i.test(base(toks[0]))) {
    // node [cờ...] script args → "script args"; node dài chỉ còn tên script
    const s = toks.findIndex((t, k) => k > 0 && !t.startsWith('-') && /\.(c|m)?js$/i.test(t))
    if (s > 0) {
      // Tên script chung chung (process.js, index.js…) thì kèm tên gói chứa nó, ví dụ "tinypool/process"
      const segs = toks[s].split(/[\\/]/)
      const generic = /^(process|index|main|cli|worker|entry)\.(c|m)?js$/i.test(segs[segs.length - 1])
      const pkg = segs.filter((x) => x && x !== 'dist' && x !== 'entry' && x !== 'lib' && x !== 'bin' && !/^[A-Za-z]:$/.test(x))
      head.push(generic && pkg.length > 1 ? pkg[pkg.length - 2].replace(/@[\d.]+$/, '') + '/' + prog(toks[s]) : prog(toks[s])); i = s + 1
    } else { head.push('node'); i = 1 }
  } else { head.push(prog(toks[0])); i = 1 }
  const tests: string[] = []
  const rest: string[] = []
  for (; i < toks.length; i++) {
    const t = toks[i]
    if (/^--reporter(=|$)/.test(t)) continue // cờ reporter (kể cả của DevDeck) chỉ làm dài dòng
    if (/^\/[dsc]$/i.test(t) && /^cmd/i.test(head[0])) { if (/^\/c$/i.test(t)) rest.push('/c'); continue }
    if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(t)) tests.push(base(t))
    else rest.push(/[\\/]/.test(t) && !t.startsWith('-') ? base(t) : t)
  }
  if (tests.length) rest.push(tests[0] + (tests.length > 1 ? ` +${tests.length - 1} file` : ''))
  return [...head, ...rest].join(' ')
}

/** Màu theo loại tiến trình. */
const kindTone = (name: string): Tone => {
  const n = name.toLowerCase()
  if (n.startsWith('node') || n.startsWith('bun')) return 'ok'
  if (n.startsWith('cmd') || n.startsWith('powershell') || n.startsWith('pwsh') || n.startsWith('bash')) return 'muted'
  if (n.startsWith('esbuild') || n.startsWith('vite') || n.startsWith('tsc')) return 'purple'
  if (n.startsWith('python') || n.startsWith('pytest')) return 'info'
  return 'ahead'
}
/** Loại job: nhận diện theo lệnh và cổng đang lắng nghe (dev server mở cổng, test thì không). */
const KIND: Partial<Record<JobKind, { label: string; tone: Tone }>> = {
  test: { label: 'Test', tone: 'purple' }, dev: { label: 'Dev server', tone: 'info' }, build: { label: 'Build', tone: 'behind' },
}

/** Các cổng đang lắng nghe, mỗi cổng là liên kết mở http://localhost:<cổng> bằng trình duyệt. */
function PortLinks({ ports, small }: { ports: JobPort[]; small?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {!small && <span className="text-fg-mute">Đang nghe</span>}
      {ports.map((x) => {
        // 0.0.0.0 / [::] = mở cho cả máy khác trong mạng; 127.0.0.1 / [::1] = chỉ máy này
        const lan = x.host === '0.0.0.0' || x.host === '[::]'
        return (
          <a key={x.port} href={`http://localhost:${x.port}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            title={`Mở http://localhost:${x.port} · lắng nghe ở ${x.host}${lan ? ' (máy khác trong mạng cũng truy cập được)' : ' (chỉ máy này)'}`}
            className="mono inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-accent hover:bg-accent/20">
            :{x.port}{lan && <span className="text-[10px] text-behind">LAN</span>}<span aria-hidden="true">↗</span>
          </a>
        )
      })}
    </span>
  )
}
const ramColor = (b: number) => (b > 1 << 30 ? 'var(--danger)' : b > 400 << 20 ? 'var(--behind)' : 'var(--accent)')
const isVitest = (j: Job) => /vitest/i.test(j.cmd) || j.procs.some((p) => /vitest/i.test(p.cmd))

function CopyBtn({ text, label = '', title = 'Sao chép bản đầy đủ' }: { text: string; label?: string; title?: string }) {
  return (
    <button className={'ghost flex flex-none items-center gap-1 rounded px-1 py-0.5 text-[12px] hover:bg-raised'} title={title} aria-label={title}
      onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(text); toast({ kind: 'ok', title: 'Đã sao chép' }) }}>
      <Icon name="copy" size={12} />{label}
    </button>
  )
}

// ---------------------------------------------------------------- Tiến độ test

const FILE_ICON: Record<string, { ch: string; cls: string }> = {
  pass: { ch: '✓', cls: 'text-accent' }, fail: { ch: '✗', cls: 'text-danger' }, running: { ch: '▶', cls: 'text-behind' },
  skip: { ch: '–', cls: 'text-fg-mute' }, queued: { ch: '·', cls: 'text-fg-mute' },
}
const fmtMs = (ms?: number) => (ms === undefined ? '' : ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms')
const pctOf = (p: JobProgress) => (p.total ? Math.round((p.done / p.total) * 100) : 0)

/** Thanh tiến độ nhiều màu: xanh = pass, đỏ = fail, cam = đang chạy. */
function ProgressBar({ p }: { p: JobProgress }) {
  const pct = (n: number) => (p.total ? (n / p.total) * 100 : 0)
  return (
    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-border">
      <span style={{ width: pct(p.pass + p.skip) + '%', background: 'var(--accent)' }} />
      <span style={{ width: pct(p.fail) + '%', background: 'var(--danger)' }} />
      <span style={{ width: pct(p.running) + '%', background: 'var(--behind)' }} />
    </span>
  )
}

/** Dòng chữ trên thanh tiến độ: 3/10 file · 30%, bên phải số file đang chạy / fail. */
function ProgressTop({ p }: { p: JobProgress }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
      <span><b className="mono font-medium text-fg">{p.done}/{p.total}</b> <span className="text-fg-mute">file · {pctOf(p)}%</span></span>
      <span className="text-fg-mute">
        {p.fail > 0 && <span className="mr-2 text-danger">{p.fail} fail</span>}
        {p.finished ? 'Đã chạy xong' : p.running > 0 ? `${p.running} đang chạy` : ''}
      </span>
    </span>
  )
}

/** Bộ lọc + danh sách file test (đang chạy / chờ / xong / tất cả). */
function FileList({ p, tall, fill }: { p: JobProgress; tall?: boolean; fill?: boolean }) {
  type Tab = 'all' | 'running' | 'todo' | 'done'
  const [picked, setPicked] = useState<Tab | null>(null)
  const isDone = (s: string) => s === 'pass' || s === 'fail' || s === 'skip'
  const counts = { all: p.total, running: p.files.filter((f) => f.state === 'running').length, todo: p.files.filter((f) => f.state === 'queued').length, done: p.files.filter((f) => isDone(f.state)).length }
  // Chưa chọn thì tự mở tab đầu tiên có file: đang chạy → chờ → xong
  const tab: Tab = picked ?? (counts.running ? 'running' : counts.todo ? 'todo' : 'done')
  const order = { running: 0, fail: 1, queued: 2, pass: 3, skip: 4 } as const
  const shown = [...p.files].sort((a, b) => order[a.state] - order[b.state])
    .filter((f) => tab === 'all' || (tab === 'running' && f.state === 'running') || (tab === 'todo' && f.state === 'queued') || (tab === 'done' && isDone(f.state)))
  return (
    <div className={'flex flex-col gap-2' + (fill ? ' h-full' : '')}>
      <Segmented<Tab> label="Lọc file test" value={tab} onChange={setPicked} options={[
        { id: 'running', label: 'Đang chạy', count: counts.running }, { id: 'todo', label: 'Chờ', count: counts.todo },
        { id: 'done', label: 'Xong', count: counts.done }, { id: 'all', label: 'Tất cả', count: counts.all },
      ]} />
      {shown.length === 0
        ? <div className="text-[12px] text-fg-mute">Không có file nào ở mục này.</div>
        : (
          <div className={'grid content-start gap-x-6 gap-y-0.5 overflow-auto text-[12px] ' + (tall ? 'max-h-[50vh] grid-cols-1' : fill ? 'min-h-0 flex-1 md:grid-cols-2' : 'max-h-44 md:grid-cols-2')}>
            {shown.map((f) => (
              <div key={f.file} className={'flex min-w-0 items-center gap-2 py-0.5' + (f.state === 'pass' || f.state === 'skip' ? ' opacity-60' : '')} title={f.file}>
                <span className={'w-3 flex-none text-center ' + FILE_ICON[f.state].cls}>{FILE_ICON[f.state].ch}</span>
                <span className="mono min-w-0 flex-1 truncate">{f.file.split('/').pop()}</span>
                <span className="mono flex-none text-fg-mute">{fmtMs(f.ms)}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

/** Hướng dẫn bật tiến độ cho project vitest chưa có reporter. */
function EnableProgress({ j }: { j: Job }) {
  const [rel, setRel] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const install = async () => {
    try { const r = await api.installReporter(j.cwd); setRel(r.rel); toast({ kind: 'ok', title: 'Đã chép reporter', detail: r.path }) } catch (e) { toast({ kind: 'err', title: 'Không chép được', detail: (e as Error).message }) }
  }
  const flag = '--reporter=default --reporter=./node_modules/.devdeck/reporter.mjs'
  // Có kiểm tra file tồn tại để đồng nghiệp chưa có reporter vẫn chạy test bình thường
  const config = `// đầu file: import fs from 'node:fs'\n// trong test: { ... }\nreporters: ['default', ...(fs.existsSync('./node_modules/.devdeck/reporter.mjs') ? ['./node_modules/.devdeck/reporter.mjs'] : [])],`
  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <div className="font-medium text-fg">Chưa có tiến độ file test (vd. 3/10 file)</div>
      <div className="text-fg-mute">Vitest chỉ báo tiến độ qua output, nên cần một reporter nhỏ ghi tiến độ ra file cho DevDeck đọc (chỉ vitest ≥ 3).</div>

      <div className="flex flex-wrap items-center gap-2 rounded-[7px] border border-border bg-bg p-2.5">
        <button className="btn primary !h-7" onClick={() => setSetupOpen(true)}><Icon name="download" size={12} />Cài dùng chung cho nhiều project…</button>
        <span className="text-fg-mute">Chọn thư mục chứa các project, cài một lần, khỏi sửa từng project (khuyên dùng).</span>
      </div>
      {setupOpen && <ReporterSetup onClose={() => setSetupOpen(false)} />}

      <details className="rounded-[7px] border border-border bg-bg p-2.5">
        <summary className="cursor-pointer font-medium text-fg-soft">Hoặc làm thủ công riêng cho project này</summary>
      <div className="mt-2 flex flex-col gap-2">
      <div className="rounded-[7px] border border-border p-2.5">
        <div className="mb-1.5 font-medium text-fg-soft">Bước 1 · Chép reporter vào project</div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn !h-6 !px-2" onClick={() => void install()}><Icon name="download" size={11} />Chép reporter vào {baseName(j.cwd)}</button>
          <span className="text-fg-mute">ghi vào <span className="mono">node_modules/.devdeck/</span> (thường đã bị gitignore)</span>
          {rel && <span className="text-accent">Đã chép: {rel}</span>}
        </div>
      </div>

      <div className="rounded-[7px] border border-border p-2.5">
        <div className="mb-1.5 font-medium text-fg-soft">Bước 2 · Chọn <u>một</u> trong hai cách</div>
        <div className="mb-2 text-fg-soft">
          <b>A. Thêm cờ vào lệnh</b> <span className="text-fg-mute">(không sửa project, nhưng lần nào cũng phải gõ):</span>
          <div className="mt-1 flex items-start gap-1"><span className="mono break-all">{flag}</span><CopyBtn text={flag} /></div>
        </div>
        <div className="text-fg-soft">
          <b>B. Thêm vào vite.config một lần</b> <span className="text-fg-mute">(chạy lệnh thường cũng có tiến độ, kể cả AI chạy):</span>
          <div className="mt-1 flex items-start gap-1"><pre className="mono m-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all text-fg-mute">{config}</pre><CopyBtn text={config} /></div>
        </div>
      </div>
      </div>
      </details>
    </div>
  )
}

// ---------------------------------------------------------------- Cây tiến trình

/** Chấm trạng thái: đang chạy / chờ / xong / đang đo. */
function StatusDot({ cpu, done }: { cpu: number | null; done?: boolean }) {
  if (done) return <span className="inline-flex items-center gap-1.5 text-fg-mute"><span className="size-[7px] rounded-full bg-[#5a6068]" />Đã xong</span>
  if (cpu === null) return <span className="inline-flex items-center gap-1.5 text-fg-mute" title="Cần thêm một lần quét để đo CPU"><span className="size-[7px] rounded-full bg-[#5a6068]" />Đang đo…</span>
  if (cpu >= BUSY) return <span className="inline-flex items-center gap-1.5"><span className="size-[7px] rounded-full bg-accent" />Đang chạy</span>
  return <span className="inline-flex items-center gap-1.5 text-behind" title="Tiến trình còn sống nhưng gần như không dùng CPU (đang chờ việc hoặc chờ tiến trình con)"><span className="size-[7px] rounded-full bg-behind" />Chờ</span>
}

function ProcTable({ j, now }: { j: Job; now: number }) {
  const rows = [{ ...j, depth: 0, done: false, endedAt: null as number | null }, ...j.procs]
  return (
    <table className="w-full text-[12px]">
      <thead><tr className="text-left text-fg-mute"><th className="px-2 pb-1.5 font-medium">Tiến trình</th><th className="font-medium">Trạng thái</th><th className="font-medium">CPU</th><th className="font-medium">RAM</th><th className="font-medium">Lệnh</th><th /></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.pid + ':' + p.start} className={'border-t border-border align-middle' + (p.done ? ' opacity-55' : '')}>
            <td className="whitespace-nowrap px-2 py-1.5" style={{ paddingLeft: 8 + p.depth * 16 }}>
              {p.depth > 0 && <span className="text-fg-mute">└ </span>}<Chip tone={kindTone(p.name)}>{p.name.replace(/\.exe$/i, '')}</Chip> <span className="mono text-fg-mute">{p.pid}</span>
              {p.ports.length > 0 && <span className="ml-1.5"><PortLinks ports={p.ports} small /></span>}
            </td>
            <td className="whitespace-nowrap"><StatusDot cpu={p.cpu} done={p.done} />{p.done && p.endedAt ? <span className="ml-1.5 text-fg-mute">{Math.max(0, Math.round((now - p.endedAt) / 1000))}s trước</span> : null}</td>
            <td className="mono whitespace-nowrap">{!p.done && p.cpu !== null ? (p.cpu < 10 ? p.cpu.toFixed(1) : Math.round(p.cpu)) + '%' : <span className="text-fg-mute">—</span>}</td>
            <td className="mono whitespace-nowrap" style={{ color: p.done ? undefined : p.mem > 400 << 20 ? ramColor(p.mem) : undefined }}>{p.done ? <span className="text-fg-mute">—</span> : mb(p.mem)}</td>
            <td className="mono max-w-[300px] truncate text-fg-soft" title={p.cmd}>{shortCmd(p.cmd) || p.name}</td>
            <td className="pr-1 text-right"><CopyBtn text={p.cmd} title="Chép lệnh đầy đủ" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------- Thẻ job

type DetailTab = 'procs' | 'test'

function JobCard({ j, now, open, onToggle, confirm, setConfirm, busy, onStop, tab, setTab, onOpenModal }: {
  j: Job; now: number; open: boolean; onToggle: () => void
  confirm: number | null; setConfirm: (pid: number | null) => void; busy: number | null; onStop: () => void
  tab: DetailTab; setTab: (t: DetailTab) => void; onOpenModal: () => void
}) {
  const s = j.stats
  const kind = KIND[j.kind]
  // Dev server đang nghe cổng thì coi là đang chạy dù CPU gần 0 (nó chờ request)
  const running = s.running > 0 || (j.cpu !== null && j.cpu >= BUSY) || j.ports.length > 0
  const hasTest = !!j.progress || isVitest(j)
  const curTab: DetailTab = hasTest ? tab : 'procs'
  const onKey = (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle() } }

  return (
    <div className={'overflow-hidden rounded-[10px] border bg-surface ' + (open ? 'border-border-strong' : 'border-border')}>
      <div role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={onKey}
        className="grid cursor-pointer grid-cols-[auto_minmax(0,1.1fr)_minmax(200px,1fr)_auto_auto] items-center gap-4 px-3.5 py-3 hover:bg-[#1F2124] max-md:grid-cols-[auto_1fr_auto]">
        <span className="size-2 rounded-full" title={running ? 'Đang chạy' : 'Đang chờ'}
          style={{ background: running ? 'var(--accent)' : 'var(--behind)', boxShadow: `0 0 0 3px ${running ? 'rgba(48,207,67,.16)' : 'rgba(242,166,90,.16)'}` }} />

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold" title={j.repo}>{baseName(j.repo)}</span>
            <span className="truncate text-[12px] text-fg-mute" title={j.cwd}>{relDir(j)}</span>
            {kind && <span className="flex-none self-center"><Chip tone={kind.tone}>{kind.label}</Chip></span>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-fg-mute">
            <span className="mono truncate" title={j.cmd}>{shortCmd(j.cmd) || j.name}</span>
            <CopyBtn text={j.cmd} title="Chép lệnh đầy đủ" />
          </div>
        </div>

        <div className="min-w-0 max-md:col-span-2 max-md:col-start-2">
          {j.progress ? (
            <button className="block w-full text-left hover:opacity-90" title="Mở danh sách file test" onClick={(e) => { e.stopPropagation(); onOpenModal() }}>
              <ProgressTop p={j.progress} /><ProgressBar p={j.progress} />
            </button>
          ) : j.kind === 'dev' ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              {j.ports.length > 0 ? <PortLinks ports={j.ports} /> : <span className="text-fg-mute">Dev server · chưa mở cổng</span>}
            </span>
          ) : (
            <span className="text-[12px] text-fg-mute" title="Tiến trình con: đang chạy · chờ · đã xong">
              {isVitest(j) ? 'Chưa bật tiến độ file · ' : 'Không có tiến độ · '}
              <span className="mono"><span className="text-accent">{s.running}</span> chạy · <span className="text-behind">{s.idle}</span> chờ · {s.done} xong</span>
            </span>
          )}
        </div>

        <div className="text-right leading-tight max-md:col-span-2 max-md:col-start-2 max-md:text-left" title={j.children ? `Gồm ${j.children} tiến trình con đang sống` : undefined}>
          <b className="mono block text-[13px] font-medium" style={{ color: ramColor(j.mem) }}>{mb(j.mem)}</b>
          <span className="text-[11px] text-fg-mute">{runtime(j.start, now)}</span>
        </div>

        <div className="whitespace-nowrap max-md:col-start-3 max-md:row-start-1" onClick={(e) => e.stopPropagation()}>
          {confirm === j.pid && <button className="btn mr-1.5" onClick={() => setConfirm(null)}>Hủy</button>}
          <button className={'btn' + (confirm === j.pid ? ' primary' : '')} disabled={busy === j.pid} onClick={onStop}
            title="Dừng job cùng toàn bộ tiến trình con và giải phóng bộ nhớ">
            <Icon name="x" size={12} />{confirm === j.pid ? 'Xác nhận dừng' : 'Dừng'}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3.5 py-2 text-[12px] text-fg-mute">
            <span className="inline-flex min-w-0 items-center gap-1"><Icon name="folder" size={12} /><span className="mono truncate text-fg-soft" title={j.cwd}>{j.cwd}</span><CopyBtn text={j.cwd} title="Chép thư mục" /></span>
            <span>Bắt đầu <b className="font-medium text-fg-soft">{new Date(j.start).toLocaleTimeString('vi-VN')}</b></span>
            <span>PID <b className="mono font-medium text-fg-soft">{j.pid}</b></span>
            <span>Chạy từ <b className="font-medium text-fg-soft">{(j.parent || '—').replace(/\.exe$/i, '')}</b> (PID {j.ppid})</span>
          </div>

          {hasTest && (
            <div className="flex gap-0.5 border-b border-border px-2.5" role="tablist">
              {([['procs', 'Tiến trình', j.procs.length + 1], ['test', 'Test', j.progress?.total ?? null]] as const).map(([id, label, n]) => (
                <button key={id} role="tab" aria-selected={curTab === id} onClick={() => setTab(id)}
                  className={'-mb-px border-b-2 px-3 py-2 text-[13px] ' + (curTab === id ? 'border-accent text-fg' : 'border-transparent text-fg-mute hover:text-fg')}>
                  {label}{n !== null && <span className="ml-1.5 text-[11px] text-fg-mute">{id === 'test' ? `${n} file` : n}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Chiều cao cố định cho cả hai tab để khung không nhảy khi đổi tab / bộ lọc; nội dung dài thì cuộn bên trong */}
          <div className="h-[272px] overflow-auto px-3.5 py-3">
            {curTab === 'procs' && <ProcTable j={j} now={now} />}
            {curTab === 'test' && (j.progress ? <FileList p={j.progress} fill /> : <EnableProgress j={j} />)}
          </div>

          {curTab === 'procs' && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2 text-[12px] text-fg-mute">
              <span><span className="text-accent">●</span> {s.running} đang chạy · <span className="text-behind">●</span> {s.idle} chờ · <span>●</span> {s.done} đã xong (chỉ ghi nhận từ lúc bạn mở trang này)</span>
              <span>Dừng sẽ tắt cả cây</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Trang

export function JobsPage() {
  const [open, setOpen] = useState<number | null>(null)
  const [tab, setTab] = usePersisted<DetailTab>('devdeck.jobs.tab', 'procs', (v) => v === 'procs' || v === 'test')
  const [modalPid, setModalPid] = useState<number | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  // Mở chi tiết thì quét nhanh hơn để thấy tiến trình con chạy / xong
  const jobs = useLoad(api.jobs, [], open !== null ? 5000 : 10000)
  const [now, setNow] = useState(Date.now())
  const [confirm, setConfirm] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const cfg = useLoad(api.jobsConfig, [])
  const [picking, setPicking] = useState(false)
  const [filter, setFilter] = useState('')
  const folders = cfg.data?.folders ?? []

  const all = jobs.data?.jobs ?? []
  const inFolder = (j: Job, f: string) => { const a = norm(j.repo), b = norm(f); return a === b || a.startsWith(b + '/') }
  const list = filter ? all.filter((j) => inFolder(j, filter)) : all
  const groups = [...new Set(list.map((j) => j.repo))].map((repo) => ({ repo, items: list.filter((j) => j.repo === repo) }))
  const total = list.reduce((s, j) => s + j.mem, 0)

  /** Lưu danh sách thư mục rồi quét lại ngay. */
  const saveFolders = async (next: string[]) => {
    try { await api.saveJobsConfig(next); cfg.reload(); jobs.reload() } catch (e) { toast({ kind: 'err', title: 'Không lưu được', detail: (e as Error).message }) }
  }
  const addFolder = async () => {
    const pick = bridge()?.pickFolder
    if (!pick) { setPicking(true); return }
    const dirs = await pick()
    if (dirs.length) void saveFolders([...new Set([...folders, ...dirs])])
  }
  const removeFolder = (f: string) => {
    const next = folders.filter((x) => x !== f)
    if (!next.length) { toast({ kind: 'err', title: 'Cần ít nhất một thư mục', detail: 'Hãy thêm thư mục khác trước khi bỏ thư mục cuối.' }); return }
    if (filter === f) setFilter('')
    void saveFolders(next)
  }

  const stop = async (j: Job) => {
    if (confirm !== j.pid) { setConfirm(j.pid); return }
    setConfirm(null); setBusy(j.pid)
    try {
      await api.stopJob(j.pid, j.start)
      toast({ kind: 'ok', title: 'Đã dừng job', detail: `${j.name} (PID ${j.pid}) · giải phóng ≈ ${mb(j.mem)}` })
    } catch (e) { toast({ kind: 'err', title: 'Không dừng được', detail: (e as Error).message }) }
    setBusy(null); jobs.reload()
  }

  // Lấy job mới nhất theo PID để cửa sổ tự cập nhật khi quét lại; job biến mất thì đóng
  const mj = modalPid !== null ? all.find((x) => x.pid === modalPid) : undefined

  return (
    <>
      <SideSlot>
        <div className="side-group">
          <NavLabel action={<button className="ghost flex size-[22px] items-center justify-center" aria-label="Thêm thư mục" title="Thêm thư mục" onClick={addFolder}><Icon name="plus" size={13} /></button>}>Thư mục theo dõi</NavLabel>
          <button className={'nav-item' + (!filter ? ' on' : '')} aria-pressed={!filter} onClick={() => setFilter('')}>
            <Icon name="folder" size={13} />Tất cả<span className="nav-n">{all.length}</span>
          </button>
          {folders.map((f) => (
            <div key={f} className="group relative">
              <button className={'nav-item' + (filter === f ? ' on' : '')} aria-pressed={filter === f} title={f} onClick={() => setFilter(filter === f ? '' : f)}>
                <Icon name="folder" size={13} /><span className="truncate font-mono text-sm">{baseName(f)}</span>
                <span className="nav-n group-hover:invisible">{all.filter((j) => inFolder(j, f)).length}</span>
              </button>
              <button className="ghost invisible absolute right-1 top-0.5 flex size-[22px] items-center justify-center focus-visible:visible group-hover:visible" aria-label={'Bỏ ' + f} title="Bỏ thư mục này khỏi danh sách theo dõi"
                onClick={() => removeFolder(f)}><Icon name="x" size={12} /></button>
            </div>
          ))}
          <div className="flex flex-col gap-2 px-2 pt-2 text-sm text-fg-mute">
            {cfg.data && !cfg.data.custom && <span>Đang dùng chung thư mục quét của trang Git.</span>}
            {cfg.data?.custom && <button className="btn w-full !h-7 whitespace-nowrap" onClick={() => void saveFolders([])} title="Bỏ danh sách riêng, dùng lại thư mục quét của Git">Dùng thư mục của Git</button>}
          </div>
        </div>
      </SideSlot>

      {mj?.progress && (
        <Modal onClose={() => setModalPid(null)} titleId="jobs-progress-title" header={<h2 id="jobs-progress-title">Tiến độ test · {baseName(mj.cwd)}</h2>}>
          <div className="flex flex-col gap-3 p-4">
            <div className="mono truncate text-[12px] text-fg-mute" title={mj.cmd}>{shortCmd(mj.cmd)}</div>
            <div><ProgressTop p={mj.progress} /><ProgressBar p={mj.progress} /></div>
            <FileList p={mj.progress} tall />
          </div>
        </Modal>
      )}
      {setupOpen && <ReporterSetup onClose={() => setSetupOpen(false)} />}
      {picking && <FolderPicker start={folders[folders.length - 1] ?? ''} selected={folders} recent={cfg.data?.recent ?? []} onClose={() => setPicking(false)}
        onToggle={(p) => { if (folders.includes(p)) removeFolder(p); else void saveFolders([...folders, p]) }} />}

      <StatusSlot>
        <span className="sb-item"><span className={'dot ' + (list.length ? 'busy' : 'ok')} />{list.length ? `${list.length} job đang chạy` : 'Không có job nào'}</span>
        {list.length > 0 && <span>{mb(total)} RAM</span>}
        <span className="sb-end">Tự làm mới mỗi {open !== null ? 5 : 10} giây</span>
      </StatusSlot>

      <div className="page" style={{ padding: '24px 28px', gap: 16 }}>
        <header className="page-h !items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1>Job</h1>
            <span className="text-[12px] text-fg-mute">Test, build, dev server đang chạy trong các thư mục theo dõi, dù chạy tay hay do công cụ khác khởi động</span>
          </div>
          {/* flex-none + nowrap: nút không bị bóp làm chữ xuống dòng khi cửa sổ hẹp; chỉ phần mô tả bên trái co lại */}
          <div className="flex flex-none items-center gap-2">
            <button className="btn whitespace-nowrap" onClick={() => setSetupOpen(true)} title="Cài reporter để xem tiến độ file test vitest (vd. 3/10 file) cho nhiều project"><Icon name="download" size={13} />Cài tiến độ test…</button>
            <button className="btn whitespace-nowrap" onClick={jobs.reload} disabled={jobs.loading}><Icon name="refresh" size={13} />Làm mới</button>
          </div>
        </header>

        {jobs.error && <div className="banner err" role="alert">Không đọc được danh sách job: {jobs.error}</div>}
        {jobs.data && !jobs.data.supported && <div className="banner">Theo dõi job hiện chỉ hỗ trợ Windows.</div>}
        {jobs.loading && !jobs.data && <Spinner label="Đang quét tiến trình…" />}
        {jobs.data?.supported && !list.length && <div className="banner">Không có job nào đang chạy trong {filter ? 'thư mục đã chọn' : 'các thư mục theo dõi'}.</div>}

        {groups.map((g) => (
          <section key={g.repo} className="flex flex-col gap-2.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[13px] font-semibold" title={g.repo}>{baseName(g.repo)}</h2>
              <span className="truncate text-[12px] text-fg-mute">{g.repo}</span>
              <span className="ml-auto flex-none"><Chip tone="info">{g.items.length} job</Chip></span>
            </div>
            {g.items.map((j): ReactNode => (
              <JobCard key={j.pid} j={j} now={now} open={open === j.pid} onToggle={() => setOpen(open === j.pid ? null : j.pid)}
                confirm={confirm} setConfirm={setConfirm} busy={busy} onStop={() => void stop(j)}
                tab={tab} setTab={setTab} onOpenModal={() => setModalPid(j.pid)} />
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
