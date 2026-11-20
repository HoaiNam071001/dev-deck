import { Fragment, useMemo } from 'react'
import { Modal } from './Modal'
import { relTime } from '../lib/format'
import { usePersisted } from '../lib/persist'
import { buildTree, isDirty, type TreeNode } from '../lib/repo'
import type { RepoSummary } from '../types'
import { RepoDetail } from './RepoDetail'

export type ViewMode = 'flat' | 'tree' | 'grid'

/** order: đường dẫn repo đã ghim, phần tử đầu = trên cùng. */
export interface PinApi { order: string[]; pin: (p: string) => void; unpin: (p: string) => void }

function PinControls({ path, pin }: { path: string; pin: PinApi }) {
  const idx = pin.order.indexOf(path)
  const pinned = idx >= 0
  return (
    <span className="pin-ctl" onClick={(e) => e.stopPropagation()}>
      <button className={'pin-btn' + (pinned ? ' on' : '')} aria-pressed={pinned} title={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
        aria-label={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'} onClick={() => (pinned ? pin.unpin(path) : pin.pin(path))}>📌</button>
      {pinned && idx > 0 && <button className="pin-btn" title="Đẩy lên đầu tiên" aria-label="Đẩy lên đầu tiên" onClick={() => pin.pin(path)}>⤒</button>}
    </span>
  )
}

export function StatusChips({ r }: { r: RepoSummary }) {
  if (r.error) return <span className="chip chip-conflict" title={r.error}>lỗi</span>
  if (!isDirty(r)) return <span className="chip chip-clean">sạch</span>
  return (
    <>
      {r.conflicts > 0 && <span className="chip chip-conflict" title="Xung đột">⚠ {r.conflicts}</span>}
      {r.staged > 0 && <span className="chip chip-staged" title="Đã stage">● {r.staged}</span>}
      {r.modified > 0 && <span className="chip chip-modified" title="Đã sửa">~ {r.modified}</span>}
      {r.untracked > 0 && <span className="chip chip-untracked" title="Chưa theo dõi">? {r.untracked}</span>}
    </>
  )
}

function BranchLabel({ r }: { r: RepoSummary }) {
  return (
    <>
      {r.detached ? <span className="tag warn" title="HEAD detached">detached @ {r.head}</span> : <span className="branch">{r.branch}</span>}
      {r.upstream && <span className="muted up"> → {r.upstream}</span>}
    </>
  )
}

function Sync({ r }: { r: RepoSummary }) {
  return (
    <>
      {r.ahead > 0 && <span className="ahead">↑{r.ahead}</span>} {r.behind > 0 && <span className="behind">↓{r.behind}</span>}
      {!r.upstream && !r.error && !r.detached && <span className="muted" title="Chưa có upstream">—</span>}
    </>
  )
}

function LastCommit({ r }: { r: RepoSummary }) {
  return r.lastCommit
    ? <>{r.lastCommit.subject}<span className="muted"> · {relTime(r.lastCommit.date)}</span></>
    : <span className="muted">chưa có commit</span>
}

interface RowProps { r: RepoSummary; active: boolean; onOpen: () => void; pin: PinApi; indent?: number; showPath?: boolean }

function RepoRow({ r, active, onOpen, pin, indent = 0, showPath = true }: RowProps) {
  return (
    <>
      <tr className={'row' + (active ? ' open' : '')} onClick={onOpen}>
        <td style={indent ? { paddingLeft: 8 + indent * 18 } : undefined}>
          <div className="name-cell">
            <PinControls path={r.path} pin={pin} />
            <button className="row-btn" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); onOpen() }}>
              <span className="caret">▸</span>
              <span><b>{r.name}</b>{showPath && <span className="path" title={r.path}>{r.path}</span>}</span>
            </button>
          </div>
        </td>
        <td><BranchLabel r={r} /></td>
        <td><StatusChips r={r} /></td>
        <td><Sync r={r} /></td>
        <td>{r.branches.length}</td>
        <td className="subject" title={r.lastCommit?.subject}><LastCommit r={r} /></td>
      </tr>
    </>
  )
}

const HEAD = <thead><tr><th>Repo</th><th>Nhánh đang mở</th><th>Trạng thái</th><th>↑↓</th><th>Nhánh</th><th>Commit cuối</th></tr></thead>

interface Common { repos: RepoSummary[]; pin: PinApi; open: string | null; setOpen: (p: string | null) => void; empty: string }

function Empty({ text, cols = 6 }: { text: string; cols?: number }) {
  return <tr><td colSpan={cols} className="empty">{text}</td></tr>
}

function FlatView({ repos, pin, open, setOpen, empty }: Common) {
  return (
    <table className="repos">
      {HEAD}
      <tbody>
        {repos.map((r) => <RepoRow key={r.path} r={r} pin={pin} active={open === r.path} onOpen={() => setOpen(r.path)} />)}
        {!repos.length && <Empty text={empty} />}
      </tbody>
    </table>
  )
}

function TreeView({ repos, pin, roots, open, setOpen, empty }: Common & { roots: string[] }) {
  // Repo đã ghim nằm ở mục riêng trên cùng (theo thứ tự ghim), phần còn lại mới vào cây
  const pinned = useMemo(() => repos.filter((r) => pin.order.includes(r.path)), [repos, pin.order])
  const tree = useMemo(() => buildTree(repos.filter((r) => !pin.order.includes(r.path)), roots), [repos, roots, pin.order])
  const [collapsedList, setCollapsedList] = usePersisted<string[]>('git.collapsed', [], Array.isArray)
  const collapsed = useMemo(() => new Set(collapsedList), [collapsedList])
  const setCollapsed = (s: Set<string>) => setCollapsedList([...s])

  const toggle = (k: string) => setCollapsedList((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))
  const allFolders = (ns: TreeNode[]): string[] => ns.flatMap((n) => (n.children.length ? [n.key, ...allFolders(n.children)] : []))

  const render = (n: TreeNode, depth: number): React.ReactNode => {
    const isCollapsed = collapsed.has(n.key)
    const folder = n.children.length > 0 || !n.repo
    return (
      <Fragment key={n.key}>
        {folder && (
          <tr className="folder-row" onClick={() => toggle(n.key)}>
            <td colSpan={6} style={{ paddingLeft: 8 + depth * 18 }}>
              <button className="row-btn" aria-expanded={!isCollapsed} onClick={(e) => { e.stopPropagation(); toggle(n.key) }}>
                <span className="caret">{isCollapsed ? '▸' : '▾'}</span>
                <span className="folder-name" title={n.key}>📁 {n.name}</span>
                <span className="muted"> · {n.count} repo{n.dirty > 0 && <> · <span className="behind">{n.dirty} thay đổi</span></>}</span>
              </button>
            </td>
          </tr>
        )}
        {n.repo && (
          <RepoRow r={n.repo} pin={pin} active={open === n.repo.path} showPath={false} indent={folder ? depth + 1 : depth}
            onOpen={() => setOpen(n.repo!.path)} />
        )}
        {!isCollapsed && n.children.map((c) => render(c, depth + 1))}
      </Fragment>
    )
  }

  return (
    <>
      <div className="tree-actions">
        <button onClick={() => setCollapsed(new Set())}>Mở hết</button>
        <button onClick={() => setCollapsed(new Set(allFolders(tree)))}>Thu gọn hết</button>
      </div>
      <table className="repos">
        {HEAD}
        <tbody>
          {pinned.length > 0 && (
            <>
              <tr className="folder-row pinned-head"><td colSpan={6}>📌 <b>Đã ghim</b><span className="muted"> · {pinned.length} repo</span></td></tr>
              {pinned.map((r) => <RepoRow key={r.path} r={r} pin={pin} active={open === r.path} indent={1} onOpen={() => setOpen(r.path)} />)}
            </>
          )}
          {tree.map((n) => render(n, 0))}
          {!repos.length && <Empty text={empty} />}
        </tbody>
      </table>
    </>
  )
}

function GridView({ repos, pin, open, setOpen, empty }: Common) {
  if (!repos.length) return <div className="empty">{empty}</div>
  return (
    <div className="repo-grid">
      {repos.map((r) => {
        const isOpen = open === r.path
        return (
          <div key={r.path} className="repo-card-wrap">
            <PinControls path={r.path} pin={pin} />
            <button className={'repo-card' + (isOpen ? ' open' : '')} aria-haspopup="dialog" onClick={() => setOpen(r.path)}>
              <span className="rc-name"><b>{r.name}</b> <span className="rc-sync"><Sync r={r} /></span></span>
              <span className="path" title={r.path}>{r.path}</span>
              <span className="rc-line"><BranchLabel r={r} /></span>
              <span className="rc-line"><StatusChips r={r} /></span>
              <span className="rc-line muted rc-commit" title={r.lastCommit?.subject}><LastCommit r={r} /></span>
              <span className="rc-line muted">{r.branches.length} nhánh</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function RepoModal({ repo, onClose, onChanged }: { repo: RepoSummary; onClose: () => void; onChanged?: () => void }) {
  return (
    <Modal onClose={onClose} titleId="repo-modal-title" header={
      <>
        <h2 id="repo-modal-title">{repo.name}</h2>
        <div className="path" title={repo.path}>{repo.path}</div>
        <div className="modal-meta"><BranchLabel r={repo} /> <Sync r={repo} /> <StatusChips r={repo} /></div>
      </>
    }>
      <RepoDetail repo={repo} onChanged={onChanged} />
    </Modal>
  )
}

export function RepoList(props: Common & { mode: ViewMode; roots: string[]; onChanged?: () => void }) {
  const current = props.open ? props.repos.find((r) => r.path === props.open) : undefined
  return (
    <>
      {props.mode === 'tree' ? <TreeView {...props} /> : props.mode === 'grid' ? <GridView {...props} /> : <FlatView {...props} />}
      {current && <RepoModal repo={current} onClose={() => props.setOpen(null)} onChanged={props.onChanged} />}
    </>
  )
}
