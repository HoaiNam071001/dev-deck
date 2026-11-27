import { useState } from 'react'
import { api, useLoad } from '../api'
import { FolderPicker } from '../components/FolderPicker'
import { SideSlot, StatusSlot } from '../components/Shell'
import { Chip, Icon, Kbd, NavLabel, Spinner, type Tone } from '../components/ui'
import { relTime } from '../lib/format'
import { bridge, MOD, notifyEnabled } from '../lib/platform'
import { baseName } from '../lib/repo'
import { Link, navigate } from '../lib/router'
import { openPalette, setState, toast, useStore } from '../lib/store'
import type { ActivityItem } from '../types'

const VERBS: Record<string, [string, Tone]> = {
  push: ['Push', 'ok'], pushBranch: ['Push', 'ok'], pull: ['Pull', 'behind'], pullBranch: ['Pull', 'behind'], fetch: ['Fetch', 'muted'],
  commit: ['Commit', 'ahead'], createBranch: ['Nhánh', 'purple'], checkout: ['Nhánh', 'purple'], stage: ['Stage', 'muted'], unstage: ['Stage', 'muted'], scan: ['Quét', 'muted'],
}
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return Date.now() - d.getTime() < 864e5 ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : relTime(iso)
}
const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối' }

function QuickCard({ to, icon, tint, title, keyHint, desc, foot }: { to: '/git' | '/ai'; icon: string; tint: string; title: string; keyHint: string; desc: string; foot: React.ReactNode }) {
  return (
    <Link to={to} className="flex gap-3.5 rounded-[10px] border border-border bg-surface p-4 !text-fg hover:border-border-strong hover:bg-[#1F2124]">
      <span className={'flex size-10 flex-none items-center justify-center rounded-[9px] ' + tint}><Icon name={icon} size={20} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2"><span className="text-[14px] font-semibold">{title}</span><span className="ml-auto font-mono text-xs text-fg-mute">{keyHint}</span></span>
        <span className="text-[12px] text-fg-mute">{desc}</span>
        <span className="mt-1 text-sm text-fg-mute">{foot}</span>
      </span>
    </Link>
  )
}

const Panel = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="panel min-w-0">
    <div className="flex items-center justify-between pr-3.5"><h2 className="panel-h">{title}</h2>{action}</div>
    {children}
  </section>
)

export function HomePage() {
  const ov = useLoad(api.overview, [], 30000, 'overview')
  const pinned = useStore((s) => s.pinned)
  const [picking, setPicking] = useState(false)
  const b = bridge()
  const cfg = ov.data?.config
  const scan = ov.data?.scan
  const [off, setOff] = useState<string[]>([])

  // Thư mục đang quét + thư mục gần đây chưa chọn; bỏ tick = không quét thư mục đó
  const known = cfg ? [...new Set([...cfg.roots, ...cfg.recent])] : []
  const active = (cfg?.roots ?? []).filter((r) => !off.includes(r))
  const saveRoots = async (next: string[]) => {
    if (!next.length) { toast({ kind: 'err', title: 'Cần ít nhất một thư mục quét' }); return }
    try { await api.saveConfig({ roots: next, depth: cfg?.depth ?? 4 }); setOff([]); ov.reload() } catch (e) { toast({ kind: 'err', title: 'Không lưu được', detail: (e as Error).message }) }
  }
  const toggleRoot = (r: string) => void saveRoots(active.includes(r) ? active.filter((x) => x !== r) : [...active, r])

  const activity: (ActivityItem | { at: string; scan: true })[] = [
    ...(ov.data?.activity ?? []), ...(scan ? [{ at: scan.at, scan: true as const }] : []),
  ].sort((a, b2) => b2.at.localeCompare(a.at)).slice(0, 6)

  const addFolder = async () => {
    const dirs = (await b?.pickFolder?.()) ?? null
    if (dirs === null) setPicking(true)
    else if (dirs.length) void saveRoots([...new Set([...active, ...dirs])])
  }
  const [notify, setNotify] = useState(notifyEnabled)
  const openRepo = (p: string) => { setState({ selected: p }); navigate('/git') }
  const keys: [string, string][] = [['Bảng lệnh', MOD + 'K'], ['Mở Git và quét', MOD + '3'], ['Mở AI', MOD + '2'], ['Quét lại repo', MOD + 'R'], ['Commit', MOD + 'Enter']]

  return (
    <>
      <SideSlot>
        <div className="side-group">
          <NavLabel>Đã ghim</NavLabel>
          {pinned.map((p) => (
            <button key={p} className="nav-item" title={p} onClick={() => openRepo(p)}>
              <span className="size-1.5 flex-none rounded-full bg-[#4A4F57]" /><span className="truncate">{baseName(p)}</span>
            </button>
          ))}
          {!pinned.length && <span className="px-2 text-sm text-fg-mute">Chưa ghim repo nào</span>}
        </div>
      </SideSlot>
      <StatusSlot>
        <span className="sb-item"><span className="dot" />Rảnh · không có tác vụ nền</span>
        <span>{cfg ? cfg.roots.length : '—'} thư mục làm việc</span>
        <span className="sb-end">Quét chỉ chạy khi mở Git</span>
      </StatusSlot>

      {picking && cfg && <FolderPicker start={cfg.roots[0] ?? ''} selected={active} recent={cfg.recent} onClose={() => setPicking(false)}
        onToggle={(p) => void saveRoots(active.includes(p) ? active.filter((x) => x !== p) : [...active, p])} />}

      <div className="page" style={{ padding: '24px 28px', gap: 18 }}>
        <header className="page-h">
          <div className="flex flex-col gap-0.5">
            <h1>{greeting()}</h1>
            <span className="text-[12px] text-fg-mute">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} · trang này không quét repo, chi tiết chỉ tải khi mở từng mục</span>
          </div>
          <button className="btn" onClick={() => openPalette()}>Bảng lệnh <span className="font-mono text-xs text-fg-mute">{MOD}K</span></button>
        </header>

        {ov.error && <div className="banner err" role="alert">Không đọc được dữ liệu: {ov.error}</div>}

        <section aria-label="Mở nhanh" className="grid grid-cols-2 gap-3">
          <QuickCard to="/git" icon="git" tint="bg-accent/12 text-accent" title="Git" keyHint={MOD + '3'} desc="Quản lý repo, nhánh, commit, push / pull"
            foot={scan ? <>Lần quét trước: <span className="text-fg-soft">{relTime(scan.at)}</span> · {scan.repos} repo trong {scan.roots.length} thư mục</> : 'Chưa quét lần nào'} />
          <QuickCard to="/ai" icon="ai" tint="bg-ahead/12 text-ahead" title="AI" keyHint={MOD + '2'} desc="Token Claude Code, Codex, Gemini, Antigravity theo thời gian, model, dự án"
            foot={<>Đọc log <span className="text-fg-soft">Claude Code · Codex · Gemini CLI · Antigravity</span> khi mở</>} />
        </section>

        <div className="grid grid-cols-2 gap-3.5">
          <Panel title="Repo đã ghim" action={<Link to="/git" className="text-[12px]">Xem trạng thái ở Git →</Link>}>
            {pinned.slice(0, 5).map((p) => (
              <div key={p} className="flex items-center gap-2.5 border-t border-line px-3.5 py-2">
                <Icon name="folder" size={14} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <button className="ghost w-fit !text-fg text-left text-[12px] font-medium" onClick={() => openRepo(p)}>{baseName(p)}</button>
                  <span className="truncate font-mono text-xs text-fg-mute" title={p}>{p}</span>
                </span>
                {b?.openVSCode && <button className="btn sm" onClick={() => b.openVSCode!(p)}>VS Code</button>}
                {b?.openTerminal && <button className="btn sm" onClick={() => b.openTerminal!(p)}>Terminal</button>}
                <button className="btn sm" onClick={() => openRepo(p)}>Mở</button>
              </div>
            ))}
            {!pinned.length && <p className="empty border-t border-line">Ghim repo ở trang Git để mở nhanh từ đây.</p>}
          </Panel>

          <Panel title="Thao tác gần đây">
            {activity.map((a, i) => {
              const sc = 'scan' in a
              const [verb, tone] = VERBS['scan' in a ? 'scan' : (a as ActivityItem).action] ?? [(a as ActivityItem).action, 'muted' as Tone]
              return (
                <div key={i} className="grid grid-cols-[64px_64px_1fr] items-center gap-2 border-t border-line px-3.5 py-[7px] text-[12px]">
                  <span className="font-mono text-sm text-fg-mute">{hhmm(a.at)}</span>
                  <span className="justify-self-start">{!sc && !a.ok ? <Chip tone="danger">Lỗi</Chip> : <Chip tone={tone}>{verb}</Chip>}</span>
                  <span className="truncate">{sc ? <>{scan!.roots.length} thư mục <span className="text-fg-mute">{scan!.repos} repo · {(scan!.ms / 1000).toFixed(1)}s</span></> : <>{a.repo} <span className="text-fg-mute">{a.ok ? a.detail : a.error}</span></>}</span>
                </div>
              )
            })}
            {!activity.length && (ov.loading && !ov.data ? <div className="border-t border-line"><div className="spinner-wrap compact"><span className="spinner" aria-hidden="true" /></div></div> : <p className="empty border-t border-line">Chưa có thao tác nào.</p>)}
          </Panel>

          <Panel title="Thư mục làm việc" action={<button className="btn sm !border !border-border-strong" onClick={addFolder}>+ Thêm thư mục</button>}>
            <div className="flex flex-col gap-1.5 px-3.5 pt-0.5 pb-3">
              {known.map((r) => (
                <label key={r} className="flex h-7 items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={active.includes(r)} onChange={() => toggleRoot(r)} aria-label={'Quét ' + r} />
                  <span className="min-w-0 flex-1 truncate font-mono" title={r}>{r}</span>
                  <span className="text-sm text-fg-mute">{cfg!.roots.includes(r) ? (scan?.byRoot[r] !== undefined ? `${scan.byRoot[r]} repo lần trước` : 'chưa quét') : 'gần đây, không quét'}</span>
                </label>
              ))}
              {!known.length && <span className="text-sm text-fg-mute">{ov.loading ? <span className="flex items-center gap-2"><Spinner inline />Đang tải…</span> : 'Chưa chọn thư mục nào'}</span>}
            </div>
          </Panel>

          <Panel title="Phím tắt">
            {b?.notify && (
              <label className="flex items-center gap-2 px-3.5 pb-1 text-[12px] text-fg-soft">
                <input type="checkbox" checked={notify} onChange={(e) => { setNotify(e.target.checked); try { localStorage.setItem('notify', e.target.checked ? '1' : '0') } catch { /* bỏ qua */ } }} />
                Thông báo hệ thống khi Push/Pull lỗi
              </label>
            )}
            <div className="flex flex-col gap-1.5 px-3.5 pt-0.5 pb-3">
              {keys.map(([label, k]) => <div key={label} className="flex h-6 items-center justify-between text-[12px] text-fg-soft">{label}<Kbd>{k}</Kbd></div>)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
