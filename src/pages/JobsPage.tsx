import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { api, useLoad } from '../api'
import { FolderPicker } from '../components/FolderPicker'
import { BranchChip, BUSY, CopyBtn, isVitest, JobDetailModal, KIND, mb, PortLinks, ProgressBar, ProgressTop, ramColor, relDir, runtime, shortCmd } from '../components/JobDetail'
import { ReporterSetup } from '../components/ReporterSetup'
import { usePersisted } from '../lib/persist'
import { RefreshInfo, useRefreshMs } from '../components/RefreshInfo'
import { SideSlot, StatusSlot } from '../components/Shell'
import { Chip, Icon, NavLabel, Spinner } from '../components/ui'
import { bridge } from '../lib/platform'
import { baseName } from '../lib/repo'
import { toast } from '../lib/store'
import type { Job } from '../types'

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Thẻ job gọn: bấm để mở modal chi tiết (dùng chung với trang Git). */
function JobCard({ j, now, onOpen, confirm, setConfirm, busy, onStop }: {
  j: Job; now: number; onOpen: (tab?: 'procs' | 'test') => void
  confirm: number | null; setConfirm: (pid: number | null) => void; busy: number | null; onStop: () => void
}) {
  const s = j.stats
  const kind = KIND[j.kind]
  // Dev server đang nghe cổng thì coi là đang chạy dù CPU gần 0 (nó chờ request)
  const running = s.running > 0 || (j.cpu !== null && j.cpu >= BUSY) || j.ports.length > 0
  const onKey = (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      <div role="button" tabIndex={0} aria-haspopup="dialog" onClick={() => onOpen()} onKeyDown={onKey}
        className="grid cursor-pointer grid-cols-[auto_minmax(0,1.1fr)_minmax(200px,1fr)_auto_auto] items-center gap-4 px-3.5 py-3 hover:bg-[#1F2124] max-md:grid-cols-[auto_1fr_auto]">
        <span className="size-2 rounded-full" title={running ? 'Đang chạy' : 'Đang chờ'}
          style={{ background: running ? 'var(--accent)' : 'var(--behind)', boxShadow: `0 0 0 3px ${running ? 'rgba(48,207,67,.16)' : 'rgba(242,166,90,.16)'}` }} />

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold" title={j.repo}>{baseName(j.repo)}</span>
            <BranchChip branch={j.branch} />
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
            <button className="block w-full text-left hover:opacity-90" title="Mở danh sách file test" onClick={(e) => { e.stopPropagation(); onOpen('test') }}>
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
    </div>
  )
}

// ---------------------------------------------------------------- Trang

export function JobsPage() {
  const [modal, setModal] = useState<{ pid: number; tab: 'procs' | 'test' } | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  // Mở chi tiết thì quét nhanh hơn để thấy tiến trình con chạy / xong
  const [rms, sec, setSec] = useRefreshMs('jobs', 10)
  const jobs = useLoad(api.jobs, [], rms && modal ? Math.min(rms, 5000) : rms, 'jobs')
  const [now, setNow] = useState(Date.now())
  const [confirm, setConfirm] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const cfg = useLoad(api.jobsConfig, [], 0, 'jobsConfig')
  const [picking, setPicking] = useState(false)
  const [filter, setFilter] = usePersisted<string>('jobs.filter', '', (v) => typeof v === 'string')
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
  const mj = modal ? all.find((x) => x.pid === modal.pid) : undefined

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

      {mj && modal && <JobDetailModal key={mj.pid} job={mj} now={now} initialTab={modal.tab} onClose={() => setModal(null)} onStopped={jobs.reload} />}
      {setupOpen && <ReporterSetup onClose={() => setSetupOpen(false)} />}
      {picking && <FolderPicker start={folders[folders.length - 1] ?? ''} selected={folders} recent={cfg.data?.recent ?? []} onClose={() => setPicking(false)}
        onToggle={(p) => { if (folders.includes(p)) removeFolder(p); else void saveFolders([...folders, p]) }} />}

      <StatusSlot>
        <span className="sb-item"><span className={'dot ' + (list.length ? 'busy' : 'ok')} />{list.length ? `${list.length} job đang chạy` : 'Không có job nào'}</span>
        {list.length > 0 && <span>{mb(total)} RAM</span>}
        <RefreshInfo at={jobs.at} ms={jobs.ms} loading={jobs.loading} sec={sec} onSec={setSec} />
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
            <button className="btn whitespace-nowrap" onClick={jobs.reload} disabled={jobs.loading}><Icon name="refresh" size={13} spin={jobs.loading} />Làm mới</button>
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
              <BranchChip branch={g.items[0]?.branch ?? null} />
              <span className="truncate text-[12px] text-fg-mute">{g.repo}</span>
              <span className="ml-auto flex-none"><Chip tone="info">{g.items.length} job</Chip></span>
            </div>
            {g.items.map((j): ReactNode => (
              <JobCard key={j.pid} j={j} now={now} onOpen={(t = 'procs') => setModal({ pid: j.pid, tab: t })}
                confirm={confirm} setConfirm={setConfirm} busy={busy} onStop={() => void stop(j)} />
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
