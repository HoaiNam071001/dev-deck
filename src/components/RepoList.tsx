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
export function repoMenu(r: RepoSummary, pinned: boolean): MenuItem[] {
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
  ]
}

interface RowProps {
  r: RepoSummary
  active: boolean
  pinned: boolean
  menuOpen: boolean
  menuUp: boolean
  onPick: () => void
  onMenu: () => void
  onCloseMenu: () => void
}

function RepoRow({ r, active, pinned, menuOpen, menuUp, onPick, onMenu, onCloseMenu }: RowProps) {
  return (
    <div className={'group relative flex items-stretch border-b border-raised ' + (active ? 'bg-selected shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-[#1F2124]')}>
      <button onClick={onPick} aria-current={active} className="flex min-w-0 flex-1 flex-col gap-[3px] border-0 bg-transparent py-[9px] pr-1 pl-3.5 text-left text-inherit">
        <span className="flex w-full items-center gap-2">
          <span className="truncate font-medium">{r.name}</span>
          
          <span className="ml-auto flex gap-1"><StatusChips r={r} /></span>
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
      {menuOpen && <ContextMenu label={'Thao tác cho ' + r.name} items={repoMenu(r, pinned)} onClose={onCloseMenu} up={menuUp} />}
    </div>
  )
}

export function RepoList({ repos, selected, pinned, menu, setMenu, onPick, empty }: {
  repos: RepoSummary[]; selected: string | null; pinned: string[]
  menu: string | null; setMenu: (p: string | null) => void
  onPick: (p: string) => void; empty: React.ReactNode
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Danh sách repo">
      {repos.map((r, i) => (
        <RepoRow key={r.path} r={r} active={selected === r.path} pinned={pinned.includes(r.path)}
          menuOpen={menu === r.path} menuUp={i >= repos.length - 3 && repos.length > 4}
          onPick={() => { setMenu(null); onPick(r.path) }} onMenu={() => setMenu(menu === r.path ? null : r.path)} onCloseMenu={() => setMenu(null)} />
      ))}
      {!repos.length && (typeof empty === 'string' ? <p className="empty">{empty}</p> : empty)}
    </div>
  )
}
