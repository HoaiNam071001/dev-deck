import { useEffect, useRef, useState } from 'react'
import { copyText, bridge, MOD, revealLabel } from '../lib/platform'
import { isDirty } from '../lib/repo'
import { relTime } from '../lib/format'
import { runAction } from '../lib/actions'
import { pinRepo, toast, unpinRepo } from '../lib/store'
import type { RepoSummary } from '../types'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { Chip, Icon } from './ui'

/** Nhãn trạng thái gọn của repo: sạch / xung đột / đã stage / đã sửa / chưa theo dõi. */
export function StatusChips({ r }: { r: RepoSummary }) {
  if (r.error) return <Chip tone="danger" title={r.error}>lỗi</Chip>
  if (!isDirty(r)) return <Chip tone="ok" title="Không có thay đổi">sạch</Chip>
  return (
    <>
      {r.conflicts > 0 && <Chip tone="danger" title="Xung đột">⚠ {r.conflicts}</Chip>}
      {r.staged > 0 && <Chip tone="ok" title="Đã stage">● {r.staged}</Chip>}
      {r.modified > 0 && <Chip tone="behind" title="Đã sửa">~ {r.modified}</Chip>}
      {r.untracked > 0 && <Chip tone="muted" title="Chưa theo dõi">? {r.untracked}</Chip>}
    </>
  )
}

/** Menu thao tác của một repo, dùng chung cho nút "⋯" và các phím tắt. */
export function repoMenu(r: RepoSummary, pinned: boolean, onDelete?: (r: RepoSummary) => void): MenuItem[] {
  const b = bridge()
  const open: MenuItem[] = []
  if (b?.openVSCode) open.push({ label: 'Mở trong VS Code', key: MOD + 'O', run: () => b.openVSCode!(r.path) })
  if (b?.openTerminal) open.push({ label: 'Mở Terminal tại đây', key: MOD + 'T', run: () => b.openTerminal!(r.path) })
  if (b?.reveal) open.push({ label: revealLabel, run: () => b.reveal!(r.path) })
  open.push({ label: 'Sao chép đường dẫn', key: MOD + 'Shift+C', run: async () => toast(await copyText(r.path) ? { kind: 'ok', title: 'Đã sao chép đường dẫn', detail: r.path } : { kind: 'err', title: 'Không sao chép được' }) })
  return [
    ...open,
    { sep: true },
    { label: 'Fetch', run: () => void runAction(r.path, r.name, 'fetch') },
    { label: 'Pull', disabled: !r.upstream, run: () => void runAction(r.path, r.name, 'pull') },
    { label: 'Push', key: MOD + 'P', disabled: r.detached, run: () => void runAction(r.path, r.name, 'push') },
    { sep: true },
    { label: pinned ? 'Bỏ ghim' : 'Ghim lên đầu', run: () => (pinned ? unpinRepo(r.path) : pinRepo(r.path)) },
    ...(onDelete ? [{ sep: true } as const, { label: 'Xóa khỏi máy…', danger: true, run: () => onDelete(r) }] : []),
  ]
}

interface RowProps {
  r: RepoSummary
  active: boolean
  pinned: boolean
  menuOpen: boolean
  menuUp: boolean
  /** Chỉ có khi danh sách được ảo hóa: hàng cao cố định, đặt theo tọa độ */
  top?: number
  onPick: () => void
  onMenu: () => void
  onCloseMenu: () => void
  onDelete?: (r: RepoSummary) => void
  /** Chế độ chọn nhiều: có ô tick ở đầu hàng */
  ticked?: boolean
  onTick?: () => void
}

/** Từ ngưỡng này danh sách chỉ dựng các hàng đang nhìn thấy. */
export const VIRTUAL_MIN = 200
const ROW_H = 56
const OVERSCAN = 6

function RepoRow({ r, active, pinned, menuOpen, menuUp, top, onPick, onMenu, onCloseMenu, onDelete, ticked, onTick }: RowProps) {
  return (
    <div style={top === undefined ? { contentVisibility: 'auto', containIntrinsicSize: `auto ${ROW_H - 2}px` } : { position: 'absolute', top, left: 0, right: 0, height: ROW_H, boxSizing: 'border-box' }} className={'group relative flex items-stretch border-b border-raised ' + (active ? 'bg-selected shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-[#1F2124]')}>
      {onTick && <label className="flex w-8 flex-none cursor-pointer items-center justify-center pl-1"><input type="checkbox" checked={!!ticked} onChange={onTick} aria-label={'Chọn ' + r.name} /></label>}
      <button onClick={onPick} aria-current={active} className="flex min-w-0 flex-1 flex-col gap-[3px] border-0 bg-transparent py-[9px] pr-1 pl-3.5 text-left text-inherit">
        <span className="flex w-full items-center gap-2">
          <span className="truncate font-medium">{r.name}</span>
          <span className="ml-auto flex gap-1">{!!r.worktrees && <Chip tone="info" title={r.worktrees + ' worktree phụ (đã gom vào repo này)'}>{r.worktrees} worktree</Chip>}<StatusChips r={r} /></span>
        </span>
        <span className="flex w-full min-w-0 items-center gap-2 text-sm text-fg-mute">
          <span className={'font-mono whitespace-nowrap ' + (r.branch ? 'text-fg-soft' : 'text-behind')}>{r.branch ?? 'detached @ ' + r.head}</span>
          {(r.ahead > 0 || r.behind > 0) && (
            <span className="font-mono whitespace-nowrap">
              {r.ahead > 0 && <span className="text-ahead">↑{r.ahead}</span>}{' '}
              {r.behind > 0 && <span className="text-behind">↓{r.behind}</span>}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate" title={r.lastCommit?.subject}>{r.error ?? r.lastCommit?.subject ?? 'chưa có commit'}</span>
          <span className="whitespace-nowrap">{r.lastCommit ? relTime(r.lastCommit.date) : ''}</span>
        </span>
      </button>
      <button className={'ghost flex w-7 flex-none items-center justify-center ' + (pinned ? '!text-accent' : 'invisible group-hover:visible focus-visible:visible')} aria-label={pinned ? 'Bỏ ghim ' + r.name : 'Ghim ' + r.name} aria-pressed={pinned} title={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
        onClick={() => (pinned ? unpinRepo(r.path) : pinRepo(r.path))}><Icon name="pin" size={12} fill={pinned} /></button>
      <button className="ghost flex w-8 flex-none items-center justify-center" aria-label={'Thao tác cho ' + r.name} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onMenu}>
        <Icon name="dots" size={14} />
      </button>
      {menuOpen && <ContextMenu label={'Thao tác cho ' + r.name} items={repoMenu(r, pinned, onDelete)} onClose={onCloseMenu} up={menuUp} />}
    </div>
  )
}

export function RepoList({ repos, selected, pinned, menu, setMenu, onPick, empty, onDelete, ticks, onTick }: {
  onDelete?: (r: RepoSummary) => void
  /** Có giá trị = đang ở chế độ chọn nhiều */
  ticks?: Set<string>; onTick?: (path: string) => void
  repos: RepoSummary[]; selected: string | null; pinned: string[]
  menu: string | null; setMenu: (p: string | null) => void
  onPick: (p: string) => void; empty: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, h: 800 })
  const virtual = repos.length > VIRTUAL_MIN

  useEffect(() => {
    const el = box.current
    if (!el || !virtual) return
    const read = () => setView({ top: el.scrollTop, h: el.clientHeight || 800 })
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', read); ro.disconnect() }
  }, [virtual])

  // Chọn bằng phím ↑↓: hàng đích có thể chưa được dựng, nên cuộn theo chỉ số
  useEffect(() => {
    const el = box.current
    if (!el || !virtual || !selected) return
    const i = repos.findIndex((r) => r.path === selected)
    if (i < 0) return
    const y = i * ROW_H
    if (y < el.scrollTop) el.scrollTop = y
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight
  }, [selected, virtual]) // eslint-disable-line react-hooks/exhaustive-deps

  const from = virtual ? Math.max(0, Math.floor(view.top / ROW_H) - OVERSCAN) : 0
  const to = virtual ? Math.min(repos.length, Math.ceil((view.top + view.h) / ROW_H) + OVERSCAN) : repos.length
  const row = (r: RepoSummary, i: number) => (
    <RepoRow key={r.path} r={r} active={selected === r.path} pinned={pinned.includes(r.path)}
      menuOpen={menu === r.path} menuUp={i >= repos.length - 3 && repos.length > 4} top={virtual ? i * ROW_H : undefined}
      onPick={() => { setMenu(null); onPick(r.path) }} onMenu={() => setMenu(menu === r.path ? null : r.path)} onCloseMenu={() => setMenu(null)} onDelete={onDelete}
      ticked={ticks?.has(r.path)} onTick={ticks && onTick ? () => onTick(r.path) : undefined} />
  )

  return (
    <div ref={box} className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Danh sách repo">
      {virtual
        ? <div style={{ position: 'relative', height: repos.length * ROW_H }}>{repos.slice(from, to).map((r, k) => row(r, from + k))}</div>
        : repos.map(row)}
      {!repos.length && (typeof empty === 'string' ? <p className="empty">{empty}</p> : empty)}
    </div>
  )
}
