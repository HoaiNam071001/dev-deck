import { useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import type { RepoDetail, StashInfo } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { DiffView } from './DiffView'
import { runAction } from '../lib/actions'
import type { Act } from './RepoChanges'
import { Icon, Spinner } from './ui'

/** Các tệp của một stash; bấm tên để xem diff của tệp đó (chỉ xem). */
function StashFiles({ repoPath, stash }: { repoPath: string; stash: StashInfo }) {
  const files = useLoad(() => api.stashFiles(repoPath, stash.ref), [repoPath, stash.ref, stash.at])
  const [open, setOpen] = useState<string | null>(null)
  const diff = useLoad(() => (open ? api.diff(repoPath, open, 'stash', stash.ref) : Promise.resolve(null)), [repoPath, stash.ref, open])
  if (files.error) return <p className="px-4 py-1 text-sm text-danger">{files.error}</p>
  if (!files.data) return <Spinner label="Đang tải…" />
  if (!files.data.length) return <p className="px-4 py-1 text-sm text-fg-mute">Stash chỉ có tệp mới (untracked) hoặc không có thay đổi theo dõi.</p>
  return (
    <div className="pb-1">
      {files.data.map((f) => (
        <div key={f.path}>
          <button type="button" className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-0.5 text-left font-mono text-[12px] text-fg hover:bg-selected" aria-expanded={open === f.path} onClick={() => setOpen(open === f.path ? null : f.path)}>
            <span className="min-w-0 flex-1 truncate" title={f.path}>{f.path}</span>
            <span className="text-[10px]">{!!f.add && <span className="text-accent">+{f.add}</span>} {!!f.del && <span className="text-danger">−{f.del}</span>}</span>
          </button>
          {open === f.path && <div className="border-y border-line bg-bg/40"><DiffView diff={diff.data} loading={diff.loading} error={diff.error} /></div>}
        </div>
      ))}
    </div>
  )
}

/** Tab "Stash": cất thay đổi đang làm dở, xem, áp dụng / lấy lại / xóa. */
export function RepoStash({ data, busy, act }: { data: RepoDetail; busy: string | null; act: Act }) {
  const [message, setMessage] = useState('')
  const [untracked, setUntracked] = useState(false)
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [dropping, setDropping] = useState<StashInfo | null>(null)
  const canStash = !busy && data.files.length > 0

  return (
    <div className="flex flex-col">
      <form className="flex flex-col gap-1.5 px-4 py-2.5" onSubmit={async (e) => { e.preventDefault(); if (canStash && await act('stash', 'stash', { message, includeUntracked: untracked })) setMessage('') }}>
        <div className="flex gap-1.5">
          <input className="min-w-0 flex-1" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ghi chú cho stash (không bắt buộc)" aria-label="Ghi chú cho stash" maxLength={200} />
          <button type="submit" className="btn" disabled={!canStash} title={data.files.length ? undefined : 'Working tree sạch, không có gì để cất'}>{busy === 'stash' ? <><Spinner inline />Đang stash…</> : 'Stash thay đổi'}</button>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-fg-mute"><input type="checkbox" checked={untracked} onChange={(e) => setUntracked(e.target.checked)} /> Gồm cả tệp mới chưa theo dõi (<span className="font-mono">--include-untracked</span>)</label>
      </form>
      {data.stashes.map((s) => {
        const open = openRef === s.ref
        return (
          <div key={s.ref + s.at} className="border-t border-line">
            <div className="flex items-center gap-2 px-4 py-[7px] hover:bg-selected">
              <button type="button" className="flex min-w-0 flex-1 cursor-pointer flex-col border-0 bg-transparent p-0 text-left" aria-expanded={open} onClick={() => setOpenRef(open ? null : s.ref)} title="Xem các tệp trong stash">
                <span className="truncate text-[12px] text-fg" title={s.message}>{open ? '▾' : '▸'} {s.message || '(không ghi chú)'}</span>
                <span className="truncate font-mono text-sm text-fg-mute">{s.ref}{s.branch && <> · {s.branch}</>} · {relTime(s.at)}</span>
              </button>
              <button className="btn sm" disabled={!!busy} title="Áp dụng lên working tree, giữ stash lại (git stash apply)" onClick={() => act('sa:' + s.ref, 'stashApply', { ref: s.ref })}>Áp dụng</button>
              <button className="btn sm" disabled={!!busy} title="Áp dụng rồi xóa stash (git stash pop). Xung đột thì stash được giữ lại" onClick={() => act('sp:' + s.ref, 'stashPop', { ref: s.ref })}>Lấy lại</button>
              <button className="ghost flex size-6 items-center justify-center hover:!text-danger" disabled={!!busy} aria-label={'Xóa ' + s.ref} title="Xóa stash…" onClick={() => setDropping(s)}><Icon name="trash" size={13} /></button>
            </div>
            {open && <StashFiles repoPath={data.path} stash={s} />}
          </div>
        )
      })}
      {!data.stashes.length && <p className="empty">Chưa có stash nào</p>}
      {dropping && (
        <ConfirmDialog title="Xóa stash" confirmLabel="Xóa stash" onClose={() => setDropping(null)}
          onConfirm={() => runAction(data.path, data.name, 'stashDrop', { ref: dropping.ref, confirm: true })}>
          <p>Xóa <span className="font-mono text-fg">{dropping.ref}</span>{dropping.message && <> (“{dropping.message}”)</>} khỏi <b>{data.name}</b>.</p>
          <p className="text-behind">Không khôi phục được từ app. Nếu cần, chỉ còn tìm lại bằng <span className="font-mono">git fsck --unreachable</span>.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
