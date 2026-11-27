import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, useLoad } from '../api'
import { FolderPicker } from '../components/FolderPicker'
import { RepoDetail } from '../components/RepoDetail'
import { RepoList } from '../components/RepoList'
import { CloneDialog, DeleteRepoDialog, NewRepoDialog } from '../components/RepoDialogs'
import { RefreshInfo, useRefreshMs } from '../components/RefreshInfo'
import { SideSlot, StatusSlot } from '../components/Shell'
import { ErrorBanner, Icon, NavLabel, Segmented, Spinner } from '../components/ui'
import { runAction } from '../lib/actions'
import { copyText, bridge, MOD } from '../lib/platform'
import { usePersisted } from '../lib/persist'
import { baseName, changeCount, isDirty, isOut, rootOf, toneColor, toneOf } from '../lib/repo'
import { getState, setRepos, setState, toast, useStore } from '../lib/store'
import type { RepoSummary } from '../types'

type Filter = 'all' | 'dirty' | 'sync' | 'clean'
type Sort = 'name' | 'recent' | 'changes'
type Tab = 'changes' | 'branches' | 'commits' | 'remotes'
const SORTS: { id: Sort; label: string }[] = [{ id: 'name', label: 'tên' }, { id: 'recent', label: 'commit mới nhất' }, { id: 'changes', label: 'nhiều thay đổi nhất' }]
const p2 = (n: number) => String(n).padStart(2, '0')
const clock = (iso: string) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` }
const MIN_W = 380, MAX_W = 720

export function GitPage() {
  const [rms, sec, setSec] = useRefreshMs('git', 30)
  const cached = useStore((s) => s.repos)
  const scannedAt = useStore((s) => s.scannedAt)
  const scanMs = useStore((s) => s.scanMs)
  const scanning = useStore((s) => s.scanning)
  const selected = useStore((s) => s.selected)
  const pinned = useStore((s) => s.pinned)
  const rev = useStore((s) => s.rev)
  const pending = useStore((s) => s.pending)

  const force = useRef(false)
  const repos = useLoad(async () => {
    const f = force.current; force.current = false
    const t0 = performance.now()
    setState({ scanning: true })
    try {
      const r = await api.repos(f)
      setRepos(r.repos, new Date().toISOString(), Math.round(performance.now() - t0))
      return r
    } finally { setState({ scanning: false }) }
  }, [], rms, 'repos')
  const cfg = useLoad(api.config, [], 0, 'gitConfig')

  const [roots, setRoots] = useState<string[]>([])
  const [depth, setDepth] = useState(4)
  const seeded = useRef(false)
  useEffect(() => { if (cfg.data && !seeded.current) { seeded.current = true; setRoots(cfg.data.roots); setDepth(cfg.data.depth) } }, [cfg.data])
  const [picking, setPicking] = useState(false)

  /** Có vỏ desktop: dùng hộp thoại chọn thư mục của hệ thống; không thì dùng hộp thoại trong app. */
  const addFolder = async () => {
    const pick = bridge()?.pickFolder
    if (!pick) { setPicking(true); return }
    const dirs = await pick()
    if (dirs.length) { const next = [...new Set([...roots, ...dirs])]; setRoots(next); void rescan(next) }
  }

  /** Lưu thư mục + độ sâu rồi quét lại. */
  const rescan = useCallback(async (nextRoots = roots, nextDepth = depth) => {
    if (!nextRoots.length) { toast({ kind: 'err', title: 'Chưa chọn thư mục quét' }); return }
    try {
      const c = await api.saveConfig({ roots: nextRoots, depth: nextDepth })
      setRoots(c.roots); setDepth(c.depth); cfg.reload()
      force.current = true
      repos.reload()
    } catch (e) { toast({ kind: 'err', title: 'Không quét được', detail: (e as Error).message }) }
  }, [roots, depth, cfg, repos])

  const [q, setQ] = usePersisted('git.q', '', (v) => typeof v === 'string')
  const [filter, setFilter] = usePersisted<Filter>('git.filter', 'all', (v) => ['all', 'dirty', 'sync', 'clean'].includes(v as string))
  const [sort, setSort] = usePersisted<Sort>('git.sort', 'name', (v) => ['name', 'recent', 'changes'].includes(v as string))
  const [rootFilter, setRootFilter] = usePersisted<string>('git.root', '', (v) => typeof v === 'string')
  const [tab, setTab] = usePersisted<Tab>('git.tab', 'changes', (v) => ['changes', 'branches', 'commits', 'remotes'].includes(v as string))
  const [menu, setMenu] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'new' | 'clone' | null>(null)
  const [deleting, setDeleting] = useState<RepoSummary | null>(null)
  const [mode, setMode] = usePersisted<'panel' | 'modal'>('git.detailMode', 'panel', (v) => v === 'panel' || v === 'modal')
  const [detailW, setDetailW] = usePersisted('git.detailW', 460, (v) => typeof v === 'number' && v >= MIN_W && v <= MAX_W)

  const list: RepoSummary[] = repos.data?.repos ?? cached
  const activeRoots = repos.data?.roots ?? roots

  const inRoot = useMemo(() => (rootFilter ? list.filter((r) => rootOf(r.path, activeRoots) === rootFilter) : list), [list, rootFilter, activeRoots])
  const tests: Record<Filter, (r: RepoSummary) => boolean> = { all: () => true, dirty: isDirty, sync: isOut, clean: (r) => !isDirty(r) && !r.error }
  const counts = { all: inRoot.length, dirty: inRoot.filter(isDirty).length, sync: inRoot.filter(isOut).length, clean: inRoot.filter(tests.clean).length }
  const rootCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of list) { const k = rootOf(r.path, activeRoots); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
    return m
  }, [list, activeRoots])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const f = inRoot.filter((r) => tests[filter](r) && (!t || (r.name + ' ' + r.path + ' ' + (r.branch ?? '')).toLowerCase().includes(t)))
    const key = (r: RepoSummary) => (r.lastCommit ? new Date(r.lastCommit.date).getTime() : 0)
    f.sort((a, b) => sort === 'recent' ? key(b) - key(a) : sort === 'changes' ? changeCount(b) - changeCount(a) : a.name.localeCompare(b.name))
    const rank = (r: RepoSummary) => { const i = pinned.indexOf(r.path); return i < 0 ? Infinity : i }
    return f.sort((a, b) => { const ra = rank(a), rb = rank(b); return ra === rb ? 0 : ra < rb ? -1 : 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRoot, q, filter, sort, pinned])

  // Sau mỗi thao tác ghi: tải lại danh sách (không đụng tới cache quét)
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } repos.reload() }, [rev]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = list.find((r) => r.path === selected)

  const fetchAll = useCallback(async () => {
    const targets = getState().repos.filter((r) => !r.error)
    toast({ kind: 'ok', title: `Đang fetch ${targets.length} repo…` })
    let ok = 0, i = 0
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < targets.length) { const r = targets[i++]; if (await runAction(r.path, r.name, 'fetch', {}, true)) ok++ }
    }))
    toast({ kind: ok === targets.length ? 'ok' : 'err', title: `Fetch xong ${ok}/${targets.length} repo` })
  }, [])

  // Lệnh từ bảng lệnh / Ctrl+R ở trang khác
  useEffect(() => {
    if (!pending) return
    if (pending === 'rescan') { if (cfg.data || seeded.current) { setState({ pending: null }); void rescan() } }
    else if (!repos.loading) { setState({ pending: null }); void fetchAll() }
  }, [pending, cfg.data, repos.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phím tắt trong trang
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.closest('input, textarea, select, [contenteditable]')
      const mod = e.ctrlKey || e.metaKey
      const sel = getState().selected
      const cur = shown.find((r) => r.path === sel)
      if (mod && e.shiftKey && e.key.toLowerCase() === 'c' && cur) { e.preventDefault(); void copyText(cur.path).then((ok) => toast(ok ? { kind: 'ok', title: 'Đã sao chép đường dẫn', detail: cur.path } : { kind: 'err', title: 'Không sao chép được' })) }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'p' && cur && !cur.detached) { e.preventDefault(); void runAction(cur.path, cur.name, 'push') }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'o' && cur && bridge()?.openVSCode) { e.preventDefault(); bridge()!.openVSCode!(cur.path) }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 't' && cur && bridge()?.openTerminal) { e.preventDefault(); bridge()!.openTerminal!(cur.path) }
      else if (e.key === 'Escape' && !typing && sel) setState({ selected: null })
      else if (!typing && !mod && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length) {
        e.preventDefault()
        const i = shown.findIndex((r) => r.path === sel)
        const n = Math.max(0, Math.min(shown.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))
        setState({ selected: shown[n].path })
        document.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])

  // Kéo đổi độ rộng khung chi tiết
  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX, startW = detailW
    const move = (ev: PointerEvent) => setDetailW(Math.max(MIN_W, Math.min(MAX_W, startW + startX - ev.clientX)))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const resizeKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setDetailW(Math.min(MAX_W, detailW + 20))
    else if (e.key === 'ArrowRight') setDetailW(Math.max(MIN_W, detailW - 20))
  }

  const empty = !list.length && (repos.loading || scanning) ? <Spinner label="Đang quét…" /> : list.length ? 'Không có repo khớp bộ lọc.' : 'Không tìm thấy repo nào. Thử thư mục khác hoặc tăng độ sâu.'
  const sortLabel = SORTS.find((s) => s.id === sort)!.label
  const pinnedRepos = pinned.map((p) => list.find((r) => r.path === p)).filter((r): r is RepoSummary => !!r)

  return (
    <>
      <SideSlot>
        <div className="side-group">
          <NavLabel action={<button className="ghost flex size-[22px] items-center justify-center" aria-label="Thêm thư mục" title="Thêm thư mục" onClick={addFolder}><Icon name="plus" size={13} /></button>}>Thư mục quét</NavLabel>
          <button className={'nav-item' + (!rootFilter ? ' on' : '')} aria-pressed={!rootFilter} onClick={() => setRootFilter('')}>
            <Icon name="folder" size={13} />Tất cả<span className="nav-n">{list.length}</span>
          </button>
          {roots.map((r) => (
            <div key={r} className="group relative">
              <button className={'nav-item' + (rootFilter === r ? ' on' : '')} aria-pressed={rootFilter === r} title={r} onClick={() => setRootFilter(rootFilter === r ? '' : r)}>
                <Icon name="folder" size={13} /><span className="truncate font-mono text-sm">{baseName(r)}</span>
                <span className="nav-n group-hover:invisible">{rootCounts.get(r) ?? 0}</span>
              </button>
              <button className="ghost invisible absolute top-0.5 right-1 flex size-[22px] items-center justify-center group-hover:visible focus-visible:visible" aria-label={'Bỏ ' + r} title="Bỏ thư mục này khỏi danh sách quét"
                onClick={() => { const next = roots.filter((x) => x !== r); setRoots(next); if (rootFilter === r) setRootFilter(''); if (next.length) void rescan(next) }}><Icon name="x" size={12} /></button>
            </div>
          ))}
          <div className="flex flex-col gap-2 px-2 pt-2 text-sm text-fg-mute">
            <label className="flex items-center justify-between">
              Độ sâu quét
              <input type="number" min={1} max={8} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Độ sâu quét" className="!h-[22px] w-12 !px-1.5 font-mono !text-sm" />
            </label>
            <button className="btn primary w-full !h-7 whitespace-nowrap" disabled={scanning || !roots.length} onClick={() => rescan()}>
              <Icon name="refresh" size={12} spin={scanning} />{scanning ? 'Đang quét…' : 'Quét lại'}
            </button>
          </div>
        </div>
        <div className="side-group">
          <NavLabel>Đã ghim</NavLabel>
          {pinnedRepos.map((r) => (
            <button key={r.path} className="nav-item" onClick={() => setState({ selected: r.path })} title={r.path}>
              <span className="size-1.5 flex-none rounded-full" style={{ background: toneColor(toneOf(r)) }} /><span className="truncate">{r.name}</span>
            </button>
          ))}
          {!pinnedRepos.length && <span className="px-2 text-sm text-fg-mute">Ghim repo từ menu “⋯”</span>}
        </div>
      </SideSlot>

      <StatusSlot>
        <span className="sb-item"><span className={'dot ' + (scanning ? 'busy' : repos.error ? 'bad' : 'ok')} />{scanning ? 'Đang quét…' : <>Quét lúc <span className="mono fg-soft">{scannedAt ? clock(scannedAt) : '—'}</span>{scanMs ? ` · ${(scanMs / 1000).toFixed(1)}s` : ''}</>}</span>
        <span>{shown.length} / {list.length} repo</span>
        <span className="sb-end"><span className="mono">↑↓</span> chọn repo · <span className="mono">{MOD}Enter</span> commit</span>
        <RefreshInfo at={repos.at} ms={repos.ms} loading={repos.loading} sec={sec} onSec={setSec} />
      </StatusSlot>

      {dialog === 'new' && <NewRepoDialog roots={roots} onClose={() => setDialog(null)} />}
      {dialog === 'clone' && <CloneDialog roots={roots} onClose={() => setDialog(null)} />}
      {deleting && <DeleteRepoDialog repo={deleting} onClose={() => setDeleting(null)} />}
      {picking && <FolderPicker start={roots[roots.length - 1] ?? ''} selected={roots} recent={cfg.data?.recent ?? []}
        onClose={() => { setPicking(false); if (roots.length && roots.join('|') !== (repos.data?.roots ?? []).join('|')) void rescan() }}
        onToggle={(p) => setRoots((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]))} />}

      <div className="relative flex min-h-0 flex-1">
        <section aria-label="Danh sách repo" className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 flex-none items-center gap-1.5 border-b border-border px-3">
            <Segmented<Filter> label="Lọc" value={filter} onChange={setFilter} options={[
              { id: 'all', label: 'Tất cả', count: counts.all }, { id: 'dirty', label: 'Thay đổi', count: counts.dirty },
              { id: 'sync', label: 'Lệch', count: counts.sync }, { id: 'clean', label: 'Sạch', count: counts.clean },
            ]} />
            <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border-strong bg-chrome px-2 text-fg-mute">
              <Icon name="search" size={12} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc repo…" aria-label="Lọc repo" className="!h-auto min-w-0 flex-1 !border-0 !bg-transparent !p-0 outline-none" />
            </label>
            <button className="icon-btn sm" style={{ border: '1px solid var(--border-strong)' }} aria-label="Sắp xếp" title={'Sắp xếp theo ' + sortLabel + ' (bấm để đổi)'}
              onClick={() => setSort(SORTS[(SORTS.findIndex((s) => s.id === sort) + 1) % SORTS.length].id)}><Icon name="sort" size={13} /></button>
            <button className="icon-btn sm" style={{ border: '1px solid var(--border-strong)' }} aria-label="Tạo repo mới" title="Tạo repo mới" disabled={!roots.length} onClick={() => setDialog('new')}><Icon name="plus" size={13} /></button>
            <button className="icon-btn sm" style={{ border: '1px solid var(--border-strong)' }} aria-label="Clone từ URL" title="Clone từ URL" disabled={!roots.length} onClick={() => setDialog('clone')}><Icon name="download" size={13} /></button>
          </div>
          {repos.error && <ErrorBanner className="m-3" onRetry={repos.reload}>Lỗi: {repos.error}</ErrorBanner>}
          <RepoList repos={shown} selected={selected} pinned={pinned} menu={menu} setMenu={setMenu} empty={empty} onDelete={setDeleting}
            onPick={(p) => { setState({ selected: p }) }} />
        </section>

        {current && mode === 'panel' && <div className="relative flex-none" style={{ width: detailW }}>
          <div role="separator" aria-orientation="vertical" aria-label="Đổi độ rộng khung chi tiết" aria-valuenow={detailW} aria-valuemin={MIN_W} aria-valuemax={MAX_W} tabIndex={0} title="Kéo để đổi độ rộng"
            onPointerDown={drag} onKeyDown={resizeKey} className="group absolute top-0 bottom-0 -left-[3px] z-10 flex w-1.5 cursor-col-resize items-center justify-center">
            <span className="h-7 w-0.5 rounded-sm bg-border-pop group-hover:bg-accent group-focus-visible:bg-accent" />
          </div>
          <section aria-label={'Chi tiết repo ' + current.name} className="flex h-full flex-col border-l border-border bg-surface-2">
            <RepoDetail key={current!.path} repo={current!} tab={tab} setTab={setTab} mode={mode} onMode={setMode} onClose={() => setState({ selected: null })} onDelete={() => setDeleting(current!)} />
          </section>
        </div>}
        {current && mode === 'modal' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-8">
            <button className="absolute inset-0 border-0 bg-[rgba(8,9,10,.6)]" aria-label="Đóng chi tiết" tabIndex={-1} onClick={() => setState({ selected: null })} />
            <section role="dialog" aria-modal="true" aria-label={'Chi tiết repo ' + current.name} className="relative flex h-full max-h-[620px] w-full max-w-[860px] flex-col overflow-hidden rounded-xl border border-border-pop bg-surface-2 shadow-[0_24px_64px_rgba(0,0,0,.6)]">
              <RepoDetail key={current!.path} repo={current!} tab={tab} setTab={setTab} mode={mode} onMode={setMode} onClose={() => setState({ selected: null })} onDelete={() => setDeleting(current!)} />
            </section>
          </div>
        )}
      </div>
    </>
  )
}
