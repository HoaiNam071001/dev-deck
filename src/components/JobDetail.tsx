import { useEffect, useState } from 'react'
import { api, useLoad } from '../api'
import { ReporterSetup } from './ReporterSetup'
import { Modal } from './Modal'
import { Chip, Icon, Segmented, type Tone } from './ui'
import { baseName } from '../lib/repo'
import { toast } from '../lib/store'
import type { Job, JobKind, JobPort, JobProgress } from '../types'

export const mb = (n: number) => (n >= 1 << 30 ? (n / (1 << 30)).toFixed(1) + ' GB' : Math.round(n / (1 << 20)) + ' MB')
export function runtime(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return s + ' giây'
  if (s < 3600) return Math.floor(s / 60) + ' phút'
  return Math.floor(s / 3600) + ' giờ ' + Math.floor((s % 3600) / 60) + ' phút'
}
/** Thư mục chạy job, rút gọn theo repo: "(gốc repo)" hoặc "src/app". */
export const relDir = (j: Job) => {
  const rel = j.cwd.slice(j.repo.length).replace(/^[\\/]+/, '').replace(/\\/g, '/')
  return rel || '(gốc repo)'
}
export const BUSY = 1

/** Rút gọn dòng lệnh để dễ đọc: bỏ đường dẫn exe/script dài, gộp danh sách file test. Bản đầy đủ nằm ở tooltip và nút Chép. */
export function shortCmd(cmd: string): string {
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
export const kindTone = (name: string): Tone => {
  const n = name.toLowerCase()
  if (n.startsWith('node') || n.startsWith('bun')) return 'ok'
  if (n.startsWith('cmd') || n.startsWith('powershell') || n.startsWith('pwsh') || n.startsWith('bash')) return 'muted'
  if (n.startsWith('esbuild') || n.startsWith('vite') || n.startsWith('tsc')) return 'purple'
  if (n.startsWith('python') || n.startsWith('pytest')) return 'info'
  return 'ahead'
}
/** Loại job: nhận diện theo lệnh và cổng đang lắng nghe (dev server mở cổng, test thì không). */
export const KIND: Partial<Record<JobKind, { label: string; tone: Tone }>> = {
  test: { label: 'Test', tone: 'purple' }, dev: { label: 'Dev server', tone: 'info' }, build: { label: 'Build', tone: 'behind' },
}

/** Các cổng đang lắng nghe, mỗi cổng là liên kết mở http://localhost:<cổng> bằng trình duyệt. */
export function PortLinks({ ports, small }: { ports: JobPort[]; small?: boolean }) {
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
export const ramColor = (b: number) => (b > 1 << 30 ? 'var(--danger)' : b > 400 << 20 ? 'var(--behind)' : 'var(--accent)')
export const isVitest = (j: Job) => /vitest/i.test(j.cmd) || j.procs.some((p) => /vitest/i.test(p.cmd))

export function CopyBtn({ text, label = '', title = 'Sao chép bản đầy đủ' }: { text: string; label?: string; title?: string }) {
  return (
    <button className={'ghost flex flex-none items-center gap-1 rounded px-1 py-0.5 text-[12px] hover:bg-raised'} title={title} aria-label={title}
      onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(text); toast({ kind: 'ok', title: 'Đã sao chép' }) }}>
      <Icon name="copy" size={12} />{label}
    </button>
  )
}

// ---------------------------------------------------------------- Tiến độ test

export const FILE_ICON: Record<string, { ch: string; cls: string }> = {
  pass: { ch: '✓', cls: 'text-accent' }, fail: { ch: '✗', cls: 'text-danger' }, running: { ch: '▶', cls: 'text-behind' },
  skip: { ch: '–', cls: 'text-fg-mute' }, queued: { ch: '·', cls: 'text-fg-mute' },
}
export const fmtMs = (ms?: number) => (ms === undefined ? '' : ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms')
export const pctOf = (p: JobProgress) => (p.total ? Math.round((p.done / p.total) * 100) : 0)

/** Thanh tiến độ nhiều màu: xanh = pass, đỏ = fail, cam = đang chạy. */
export function ProgressBar({ p }: { p: JobProgress }) {
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
export function ProgressTop({ p }: { p: JobProgress }) {
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
export function FileList({ p, tall, fill }: { p: JobProgress; tall?: boolean; fill?: boolean }) {
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
export function EnableProgress({ j }: { j: Job }) {
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
export function StatusDot({ cpu, done }: { cpu: number | null; done?: boolean }) {
  if (done) return <span className="inline-flex items-center gap-1.5 text-fg-mute"><span className="size-[7px] rounded-full bg-[#5a6068]" />Đã xong</span>
  if (cpu === null) return <span className="inline-flex items-center gap-1.5 text-fg-mute" title="Cần thêm một lần quét để đo CPU"><span className="size-[7px] rounded-full bg-[#5a6068]" />Đang đo…</span>
  if (cpu >= BUSY) return <span className="inline-flex items-center gap-1.5"><span className="size-[7px] rounded-full bg-accent" />Đang chạy</span>
  return <span className="inline-flex items-center gap-1.5 text-behind" title="Tiến trình còn sống nhưng gần như không dùng CPU (đang chờ việc hoặc chờ tiến trình con)"><span className="size-[7px] rounded-full bg-behind" />Chờ</span>
}

export function ProcTable({ j, now }: { j: Job; now: number }) {
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

export type DetailTab = 'procs' | 'test'


/** Chip nhánh git hiện tại của repo chứa job. */
export function BranchChip({ branch }: { branch: string | null }) {
  if (!branch) return null
  return (
    <span className="mono inline-flex flex-none items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent" title={'Nhánh hiện tại: ' + branch}>
      <Icon name="git" size={11} />{branch}
    </span>
  )
}

/** Modal chi tiết một job, dùng chung cho trang Job và trang Git. `job` nên là bản mới nhất theo PID để tự cập nhật khi quét lại. */
export function JobDetailModal({ job: j, now, onClose, onStopped, initialTab = 'procs' }: { job: Job; now: number; onClose: () => void; onStopped?: () => void; initialTab?: DetailTab }) {
  const [tab, setTab] = useState<DetailTab>(initialTab)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = j.stats
  const kind = KIND[j.kind]
  const hasTest = !!j.progress || isVitest(j)
  const curTab: DetailTab = hasTest ? tab : 'procs'
  const stop = async () => {
    if (!confirm) { setConfirm(true); return }
    setConfirm(false); setBusy(true)
    try {
      await api.stopJob(j.pid, j.start)
      toast({ kind: 'ok', title: 'Đã dừng job', detail: `${j.name} (PID ${j.pid}) · giải phóng ≈ ${mb(j.mem)}` })
      onStopped?.(); onClose()
    } catch (e) { toast({ kind: 'err', title: 'Không dừng được', detail: (e as Error).message }) }
    setBusy(false)
  }
  return (
    <Modal onClose={onClose} titleId="job-detail-title" header={
      <h2 id="job-detail-title" className="flex min-w-0 items-center gap-2">
        <span className="truncate">{baseName(j.repo)}</span>
        <span className="text-[12px] font-normal text-fg-mute">{relDir(j)}</span>
        <BranchChip branch={j.branch} />
        {kind && <Chip tone={kind.tone}>{kind.label}</Chip>}
        {j.runId && <Chip tone="info">chạy từ app</Chip>}
      </h2>
    }>
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3.5 py-2 text-[12px] text-fg-mute">
          <span className="inline-flex min-w-0 items-center gap-1"><span className="mono truncate text-fg-soft" title={j.cmd}>{shortCmd(j.cmd) || j.name}</span><CopyBtn text={j.cmd} title="Chép lệnh đầy đủ" /></span>
          <span className="inline-flex min-w-0 items-center gap-1"><Icon name="folder" size={12} /><span className="mono truncate text-fg-soft" title={j.cwd}>{j.cwd}</span><CopyBtn text={j.cwd} title="Chép thư mục" /></span>
          <span>Bắt đầu <b className="font-medium text-fg-soft">{new Date(j.start).toLocaleTimeString('vi-VN')}</b> · {runtime(j.start, now)}</span>
          <span>PID <b className="mono font-medium text-fg-soft">{j.pid}</b></span>
          <span>Chạy từ <b className="font-medium text-fg-soft">{(j.parent || '—').replace(/\.exe$/i, '')}</b> (PID {j.ppid})</span>
          <span>RAM <b className="mono font-medium" style={{ color: ramColor(j.mem) }}>{mb(j.mem)}</b></span>
        </div>
        {j.ports.length > 0 && <div className="border-b border-border px-3.5 py-2 text-[12px]"><PortLinks ports={j.ports} /></div>}

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

        <div className="h-[300px] overflow-auto px-3.5 py-3">
          {curTab === 'procs' && <ProcTable j={j} now={now} />}
          {curTab === 'test' && (j.progress ? <FileList p={j.progress} fill /> : <EnableProgress j={j} />)}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2 text-[12px] text-fg-mute">
          <span><span className="text-accent">●</span> {s.running} đang chạy · <span className="text-behind">●</span> {s.idle} chờ · ● {s.done} đã xong</span>
          <span className="flex items-center gap-1.5">
            {confirm && <button className="btn" onClick={() => setConfirm(false)}>Hủy</button>}
            <button className={'btn' + (confirm ? ' primary' : '')} disabled={busy} onClick={() => void stop()} title="Dừng job cùng toàn bộ tiến trình con và giải phóng bộ nhớ">
              <Icon name="x" size={12} />{confirm ? 'Xác nhận dừng' : 'Dừng'}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  )
}

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const samePath = (a: string, b: string) => normPath(a) === normPath(b)

/** Dải "Job đang chạy" của một repo (trang Git): mỗi job một dòng, bấm mở modal chi tiết. Không hiện gì nếu repo không có job. */
export function RepoJobs({ repoPath }: { repoPath: string }) {
  const jobs = useLoad(api.jobs, [], 10000, 'jobs')
  const [pid, setPid] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const list = (jobs.data?.jobs ?? []).filter((j) => samePath(j.repo, repoPath))
  const sel = pid !== null ? list.find((j) => j.pid === pid) : undefined
  if (!list.length) return null
  return (
    <>
      <div className="flex flex-col gap-1 rounded-[7px] border border-border bg-bg p-1.5">
        <span className="px-1 text-[10px] font-semibold tracking-[.08em] text-fg-mute uppercase">Job đang chạy · {list.length}</span>
        {list.map((j) => {
          const kind = KIND[j.kind]
          return (
            <button key={j.pid} className="flex min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-selected" title="Xem chi tiết job" onClick={() => setPid(j.pid)}>
              <span className="size-1.5 flex-none rounded-full bg-accent" />
              {kind && <Chip tone={kind.tone}>{kind.label}</Chip>}
              {j.runId && <Chip tone="info">từ app</Chip>}
              <span className="mono min-w-0 flex-1 truncate text-fg-soft">{shortCmd(j.cmd) || j.name}</span>
              {j.ports.length > 0 && <span className="mono flex-none text-accent">:{j.ports[0].port}</span>}
              {j.progress && <span className="mono flex-none text-fg-mute">{j.progress.done}/{j.progress.total}</span>}
              <span className="mono flex-none" style={{ color: ramColor(j.mem) }}>{mb(j.mem)}</span>
              <span className="flex-none text-fg-mute">{runtime(j.start, now)}</span>
            </button>
          )
        })}
      </div>
      {sel && <JobDetailModal key={sel.pid} job={sel} now={now} onClose={() => setPid(null)} onStopped={jobs.reload} />}
    </>
  )
}
