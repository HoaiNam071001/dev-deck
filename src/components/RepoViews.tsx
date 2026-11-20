import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { relTime } from '../lib/format'
import { buildTree, isDirty, type TreeNode } from '../lib/repo'
import type { RepoSummary } from '../types'
import { RepoDetail } from './RepoDetail'

export type ViewMode = 'flat' | 'tree' | 'grid'

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

interface RowProps { r: RepoSummary; active: boolean; onOpen: () => void; indent?: number; showPath?: boolean }

function RepoRow({ r, active, onOpen, indent = 0, showPath = true }: RowProps) {
  return (
    <>
      <tr className={'row' + (active ? ' open' : '')} onClick={onOpen}>
        <td style={indent ? { paddingLeft: 8 + indent * 18 } : undefined}>
          <button className="row-btn" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); onOpen() }}>
            <span className="caret">▸</span>
            <span><b>{r.name}</b>{showPath && <span className="path" title={r.path}>{r.path}</span>}</span>
          </button>
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

interface Common { repos: RepoSummary[]; open: string | null; setOpen: (p: string | null) => void; empty: string }

function Empty({ text, cols = 6 }: { text: string; cols?: number }) {
  return <tr><td colSpan={cols} className="empty">{text}</td></tr>
}

function FlatView({ repos, open, setOpen, empty }: Common) {
  return (
    <table className="repos">
      {HEAD}
      <tbody>
        {repos.map((r) => <RepoRow key={r.path} r={r} active={open === r.path} onOpen={() => setOpen(r.path)} />)}
        {!repos.length && <Empty text={empty} />}
      </tbody>
    </table>
  )
}

function TreeView({ repos, roots, open, setOpen, empty }: Common & { roots: string[] }) {
  const tree = useMemo(() => buildTree(repos, roots), [repos, roots])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (k: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
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
          <RepoRow r={n.repo} active={open === n.repo.path} showPath={false} indent={folder ? depth + 1 : depth}
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
          {tree.map((n) => render(n, 0))}
          {!repos.length && <Empty text={empty} />}
        </tbody>
      </table>
    </>
  )
}

function GridView({ repos, open, setOpen, empty }: Common) {
  if (!repos.length) return <div className="empty">{empty}</div>
  return (
    <div className="repo-grid">
      {repos.map((r) => {
        const isOpen = open === r.path
        return (
          <Fragment key={r.path}>
            <button className={'repo-card' + (isOpen ? ' open' : '')} aria-haspopup="dialog" onClick={() => setOpen(r.path)}>
              <span className="rc-name"><b>{r.name}</b> <span className="rc-sync"><Sync r={r} /></span></span>
              <span className="path" title={r.path}>{r.path}</span>
              <span className="rc-line"><BranchLabel r={r} /></span>
              <span className="rc-line"><StatusChips r={r} /></span>
              <span className="rc-line muted rc-commit" title={r.lastCommit?.subject}><LastCommit r={r} /></span>
              <span className="rc-line muted">{r.branches.length} nhánh</span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

function RepoModal({ repo, onClose }: { repo: RepoSummary; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => { if (d?.open) d.close() }
  }, [])
  return (
    <dialog ref={ref} className="repo-modal" aria-labelledby="repo-modal-title" onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="modal-head">
        <div className="modal-title">
          <h2 id="repo-modal-title">{repo.name}</h2>
          <div className="path" title={repo.path}>{repo.path}</div>
          <div className="modal-meta"><BranchLabel r={repo} /> <Sync r={repo} /> <StatusChips r={repo} /></div>
        </div>
        <button onClick={onClose} aria-label="Đóng">✕</button>
      </div>
      <RepoDetail repo={repo} />
    </dialog>
  )
}

export function RepoList(props: Common & { mode: ViewMode; roots: string[] }) {
  const current = props.open ? props.repos.find((r) => r.path === props.open) : undefined
  return (
    <>
      {props.mode === 'tree' ? <TreeView {...props} /> : props.mode === 'grid' ? <GridView {...props} /> : <FlatView {...props} />}
      {current && <RepoModal repo={current} onClose={() => props.setOpen(null)} />}
    </>
  )
}
