import { useEffect, useState, type KeyboardEvent } from 'react'
import { api, useLoad } from '../api'
import { stepIndex } from '../lib/diff'
import { useStore } from '../lib/store'
import type { DiffKind, FileChange, RepoDetail } from '../types'
import { DiffView } from './DiffView'
import { Kbd } from './ui'

const isStaged = (f: FileChange) => f.kind === 'change' && f.x !== '.'
const isUnstaged = (f: FileChange) => f.kind !== 'change' || f.y !== '.'

const LETTER: Record<string, string> = {
  M: 'bg-behind/15 text-behind', A: 'bg-accent/15 text-accent', D: 'bg-danger/15 text-danger',
  R: 'bg-ahead/15 text-ahead', C: 'bg-ahead/15 text-ahead', U: 'bg-danger/15 text-danger', '?': 'bg-border text-untracked',
}

const SectionHead = ({ title, action }: { title: string; action: React.ReactNode }) => (
  <div className="flex items-center justify-between px-4 pt-2 pb-0.5">
    <span className="text-[10px] font-semibold tracking-[.08em] text-fg-mute uppercase">{title}</span>{action}
  </div>
)

type Sel = { path: string; staged: boolean }
export type Act = (label: string, action: string, params?: Record<string, unknown>, quiet?: boolean) => Promise<boolean | undefined | void>

function FileRow({ f, staged, add, del, busy, selected, onToggle, onSelect }: { f: FileChange; staged: boolean; add?: number; del?: number; busy: boolean; selected: boolean; onToggle: () => void; onSelect: () => void }) {
  const letter = staged ? f.x : f.kind === 'untracked' ? '?' : f.kind === 'conflict' ? 'U' : f.y
  const i = f.path.lastIndexOf('/')
  return (
    <div className={'flex items-center gap-2 px-4 py-1 font-mono text-[12px] hover:bg-selected ' + (selected ? 'bg-selected' : '')} aria-current={selected || undefined}>
      <input type="checkbox" checked={staged} disabled={busy} onChange={onToggle} aria-label={(staged ? 'Bỏ stage ' : 'Stage ') + f.path} />
      <span className={'flex size-4 flex-none items-center justify-center rounded-[3px] text-[10px] font-semibold ' + (LETTER[letter] ?? LETTER['?'])}>{letter}</span>
      <button type="button" className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit]" title={f.path + ' — xem diff'} aria-expanded={selected} onClick={onSelect}>
        <span className="text-fg-mute">{f.path.slice(0, i + 1)}</span>{f.path.slice(i + 1)}
      </button>
      <span className="text-[10px]">
        {!!add && <span className="text-accent">+{add}</span>} {!!del && <span className="text-danger">−{del}</span>}
      </span>
    </div>
  )
}

/** Tab "Thay đổi": danh sách tệp, bấm tên để xem diff ngay bên dưới, stage / bỏ stage từng hunk. */
export function RepoChanges({ data, busy, act }: { data: RepoDetail; busy: string | null; act: Act }) {
  const rev = useStore((s) => s.rev)
  const staged = data.files.filter(isStaged)
  const unstaged = data.files.filter(isUnstaged)
  const [sel, setSel] = useState<Sel | null>(null)
  const [hi, setHi] = useState(0)

  const rows: Sel[] = [...staged.map((f) => ({ path: f.path, staged: true })), ...unstaged.map((f) => ({ path: f.path, staged: false }))]
  const file = sel ? data.files.find((f) => f.path === sel.path) : undefined
  const kind: DiffKind = !sel ? 'unstaged' : sel.staged ? 'staged' : file?.kind === 'untracked' ? 'untracked' : 'unstaged'
  // Tệp biến mất khỏi danh sách (đã commit / stage hết) thì bỏ chọn
  const stillThere = !!sel && rows.some((r) => r.path === sel.path && r.staged === sel.staged)
  useEffect(() => { if (sel && !stillThere) setSel(null) }, [sel, stillThere])
  useEffect(() => { setSel(null) }, [data.path])
  useEffect(() => { setHi(0) }, [sel?.path, sel?.staged])

  const diff = useLoad(() => (sel && stillThere ? api.diff(data.path, sel.path, kind) : Promise.resolve(null)), [data.path, sel?.path, kind, rev, stillThere])
  const hunks = diff.data?.hunks ?? []
  const canHunk = !!sel && (sel.staged || (kind === 'unstaged' && file?.kind === 'change')) && !diff.data?.nonUtf8 && !diff.data?.binary
  const hunkAt = Math.min(hi, hunks.length - 1)

  const hunkAction = (hash?: string) => {
    if (!sel || !canHunk || busy || !hash) return
    void act('h:' + hash, sel.staged ? 'unstageHunk' : 'stageHunk', { file: sel.path, hash }, true)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('textarea, select, input[type=text]')) return
    const move = (dir: 1 | -1) => {
      const at = sel ? rows.findIndex((r) => r.path === sel.path && r.staged === sel.staged) : -1
      const next = rows[at < 0 ? (dir === 1 ? 0 : rows.length - 1) : stepIndex(at, dir, rows.length)]
      if (next) setSel(next)
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === ']') { e.preventDefault(); setHi(stepIndex(hunkAt < 0 ? -1 : hunkAt, 1, hunks.length)) }
    else if (e.key === '[') { e.preventDefault(); setHi(stepIndex(hunkAt, -1, hunks.length)) }
    else if ((e.key === 's' && sel && !sel.staged) || (e.key === 'u' && sel?.staged)) { e.preventDefault(); hunkAction(hunks[hunkAt]?.hash) }
  }

  if (!data.files.length) return <p className="empty">Working tree sạch</p>

  const diffPanel = (
    <div className="border-y border-line bg-bg/40">
      <DiffView diff={diff.data} loading={diff.loading} error={diff.error} active={hunkAt} onActive={setHi}
        action={canHunk ? { label: sel!.staged ? 'Bỏ stage hunk' : 'Stage hunk', hint: sel!.staged ? 'u' : 's', busy: !!busy?.startsWith('h:'), disabled: !!busy, run: hunkAction } : undefined} />
    </div>
  )
  const renderRow = (f: FileChange, isStagedRow: boolean) => {
    const open = sel?.path === f.path && sel.staged === isStagedRow
    const ns = data.numstat?.[isStagedRow ? 'staged' : 'unstaged'][f.path]
    return (
      <div key={(isStagedRow ? 's' : 'u') + f.path}>
        <FileRow f={f} staged={isStagedRow} add={ns?.[0]} del={ns?.[1]} busy={!!busy} selected={open}
          onToggle={() => act((isStagedRow ? 'u:' : 's:') + f.path, isStagedRow ? 'unstage' : 'stage', { paths: [f.path] }, true)}
          onSelect={() => setSel(open ? null : { path: f.path, staged: isStagedRow })} />
        {open && diffPanel}
      </div>
    )
  }

  return (
    <div className="pb-1.5 outline-none" tabIndex={-1} onKeyDown={onKey}>
      <SectionHead title={`Đã stage · ${staged.length}`} action={<button className="ghost h-6 text-sm disabled:opacity-40" disabled={!!busy || !staged.length} onClick={() => act('unstageAll', 'unstage', { all: true }, true)}>Bỏ stage tất cả</button>} />
      {staged.map((f) => renderRow(f, true))}
      {!staged.length && <p className="px-4 py-1 text-sm text-fg-mute">Chưa có tệp nào được stage</p>}
      <SectionHead title={`Chưa stage · ${unstaged.length}`} action={<button className="ghost h-6 text-sm !text-accent disabled:opacity-40" disabled={!!busy || !unstaged.length} onClick={() => act('stageAll', 'stage', { all: true }, true)}>Stage tất cả</button>} />
      {unstaged.map((f) => renderRow(f, false))}
      <p className="px-4 pt-2 text-[11px] text-fg-mute">Bấm tên tệp để xem diff · <Kbd>↑</Kbd><Kbd>↓</Kbd> chọn tệp · <Kbd>]</Kbd><Kbd>[</Kbd> hunk kế / trước · <Kbd>s</Kbd> stage hunk · <Kbd>u</Kbd> bỏ stage hunk</p>
    </div>
  )
}
