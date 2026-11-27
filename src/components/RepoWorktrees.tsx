import { useEffect, useState } from 'react'
import { api } from '../api'
import { runAction } from '../lib/actions'
import { bridge, revealLabel } from '../lib/platform'
import { worktreeDir } from '../lib/repo'
import type { RepoDetail, WorktreeInfo } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import type { Act } from './RepoChanges'
import { Chip, Icon, Spinner } from './ui'

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

/** Xóa worktree: dry-run lấy số thay đổi chưa commit; còn thay đổi thì phải tick "vẫn xóa" (--force). Nhánh không bị xóa. */
function RemoveWorktreeDialog({ repo, wt, onClose }: { repo: RepoDetail; wt: WorktreeInfo; onClose: () => void }) {
  const [info, setInfo] = useState<{ dirty: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [force, setForce] = useState(false)
  useEffect(() => {
    api.action(repo.path, 'worktreeRemove', { dir: wt.path, dryRun: true }).then((r) => setInfo(r.info as unknown as { dirty: number }), (e: Error) => setError(e.message))
  }, [repo.path, wt.path])
  const name = baseOf(wt.path)
  return (
    <ConfirmDialog title="Xóa worktree" confirmLabel="Xóa worktree" confirmWord={name} loading={!info && !error} disabled={!!error || (!!info && info.dirty > 0 && !force)}
      onConfirm={() => runAction(repo.path, repo.name, 'worktreeRemove', { dir: wt.path, force, confirmName: name })} onClose={onClose}>
      {error ? <p className="text-danger">{error}</p> : info && <>
        <p>Xóa thư mục <span className="font-mono text-fg break-all">{wt.path}</span> (<span className="font-mono">git worktree remove</span>).</p>
        <p className="text-fg-mute">{wt.branch ? <>Nhánh <span className="font-mono">{wt.branch}</span> được giữ nguyên.</> : 'Worktree đang ở trạng thái detached.'}</p>
        {info.dirty > 0 && <>
          <p className="text-behind">Còn <b>{info.dirty}</b> tệp thay đổi chưa commit (kể cả tệp mới); xóa là mất chúng.</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Vẫn xóa (<span className="font-mono">--force</span>)</label>
        </>}
      </>}
    </ConfirmDialog>
  )
}

/** Tab "Worktree": làm song song nhiều nhánh trên cùng một repo (mỗi nhánh một thư mục). */
export function RepoWorktrees({ data, busy, act }: { data: RepoDetail; busy: string | null; act: Act }) {
  const b = bridge()
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [branch, setBranch] = useState('')
  const [dir, setDir] = useState('')
  const [removing, setRemoving] = useState<WorktreeInfo | null>(null)
  const used = new Set(data.worktrees.map((w) => w.branch))
  const free = data.branches.filter((x) => !x.remote && !used.has(x.name)).map((x) => x.name)
  const name = mode === 'existing' ? (branch || free[0] || '') : branch.trim()
  const target = dir.trim() || (name ? worktreeDir(data.path, name) : '')
  const hasPrunable = data.worktrees.some((w) => w.prunable)
  const iconBtn = 'icon-btn sm'

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || busy) return
    if (await act('wtadd', 'worktreeAdd', { branch: name, create: mode === 'new', dir: dir.trim() || undefined })) { setBranch(''); setDir('') }
  }

  return (
    <div className="flex flex-col">
      <form className="flex flex-col gap-1.5 px-4 py-2.5" onSubmit={add}>
        <div className="flex gap-1.5">
          <select className="font-mono" value={mode} onChange={(e) => { setMode(e.target.value as 'new' | 'existing'); setBranch('') }} aria-label="Kiểu nhánh">
            <option value="new">Nhánh mới</option>
            <option value="existing" disabled={!free.length}>Nhánh có sẵn</option>
          </select>
          {mode === 'new'
            ? <input className="min-w-0 flex-1 font-mono" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Tên nhánh mới" aria-label="Tên nhánh mới" spellCheck={false} />
            : <select className="min-w-0 flex-1 font-mono" value={name} onChange={(e) => setBranch(e.target.value)} aria-label="Nhánh có sẵn">{free.map((n) => <option key={n}>{n}</option>)}</select>}
          <button type="submit" className="btn" disabled={!!busy || !name}>{busy === 'wtadd' ? <><Spinner inline />Đang tạo…</> : 'Thêm worktree'}</button>
        </div>
        <input className="font-mono text-[12px]" value={dir} onChange={(e) => setDir(e.target.value)} placeholder={target || 'Thư mục (mặc định <repo>-wt/<nhánh>)'} aria-label="Thư mục worktree" spellCheck={false} />
        <p className="text-sm text-fg-mute">Thư mục phải nằm trong thư mục quét và chưa có tệp. {mode === 'existing' && !free.length && 'Mọi nhánh local đều đã có worktree.'}</p>
      </form>

      {data.worktrees.map((w) => (
        <div key={w.path} className="flex items-center gap-2 border-t border-line px-4 py-[7px] hover:bg-selected">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-mono text-[12px] text-fg">{w.branch ?? (w.bare ? '(bare)' : 'detached @ ' + w.head)}</span>
              {w.main && <Chip tone="muted">chính</Chip>}
              {w.locked && <Chip tone="behind" title="Worktree bị khóa (git worktree lock)">khóa</Chip>}
              {w.prunable && <Chip tone="danger" title="Thư mục đã bị xóa; dọn bằng prune">đã mất</Chip>}
              {!w.prunable && w.dirty !== null && (w.dirty > 0 ? <Chip tone="behind" title="Tệp thay đổi chưa commit">~ {w.dirty}</Chip> : <Chip tone="ok">sạch</Chip>)}
            </span>
            <span className="truncate font-mono text-sm text-fg-mute" title={w.path}>{w.path}</span>
          </span>
          {!w.prunable && !w.bare && <>
            {b?.openVSCode && <button className={iconBtn} title="Mở trong VS Code" aria-label={'Mở ' + w.path + ' trong VS Code'} onClick={() => b.openVSCode!(w.path)}><Icon name="code" size={13} /></button>}
            {b?.openTerminal && <button className={iconBtn} title="Mở Terminal" aria-label={'Mở Terminal ở ' + w.path} onClick={() => b.openTerminal!(w.path)}><Icon name="terminal" size={13} /></button>}
            {b?.reveal && <button className={iconBtn} title={revealLabel} aria-label={revealLabel + ': ' + w.path} onClick={() => b.reveal!(w.path)}><Icon name="folder" size={13} /></button>}
          </>}
          {!w.main && <button className={iconBtn + ' hover:!text-danger'} disabled={!!busy || w.prunable} title={w.prunable ? 'Thư mục đã mất: dùng "Dọn worktree hỏng"' : w.locked ? 'Worktree đang khóa' : 'Xóa worktree…'} aria-label={'Xóa worktree ' + baseOf(w.path)} onClick={() => setRemoving(w)}><Icon name="trash" size={13} /></button>}
        </div>
      ))}
      {data.worktrees.length <= 1 && <p className="empty">Chưa có worktree phụ. Mỗi worktree là một thư mục riêng cho một nhánh, dùng chung lịch sử với repo này.</p>}
      {hasPrunable && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-sm text-fg-mute">
          <span>Có worktree mà thư mục đã bị xóa tay.</span>
          <button className="btn sm" disabled={!!busy} onClick={() => act('wtprune', 'worktreePrune')}>Dọn worktree hỏng</button>
        </div>
      )}
      {removing && <RemoveWorktreeDialog repo={data} wt={removing} onClose={() => setRemoving(null)} />}
    </div>
  )
}
