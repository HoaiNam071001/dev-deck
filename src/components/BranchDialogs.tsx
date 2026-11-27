import { useEffect, useState } from 'react'
import { api } from '../api'
import { runAction } from '../lib/actions'
import type { DeleteBranchInfo } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import { Spinner } from './ui'

type Common = { repoPath: string; repoName: string; onClose: () => void }

/** Dry-run trước để biết nhánh đã merge chưa, rồi mới cho xóa. Nhánh chưa merge phải tick thêm ô "xóa dù chưa merge" (git branch -D). */
export function DeleteBranchDialog({ repoPath, repoName, branch, onClose }: Common & { branch: string }) {
  const [info, setInfo] = useState<DeleteBranchInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [force, setForce] = useState(false)
  useEffect(() => {
    api.action(repoPath, 'deleteBranch', { branch, dryRun: true }).then((r) => setInfo(r.info as unknown as DeleteBranchInfo), (e: Error) => setError(e.message))
  }, [repoPath, branch])
  const blocked = !!error || (!!info && !info.merged && !force)
  return (
    <ConfirmDialog title="Xóa nhánh local" confirmLabel="Xóa nhánh" confirmWord={branch} loading={!info && !error} disabled={blocked}
      onConfirm={() => runAction(repoPath, repoName, 'deleteBranch', { branch, force, confirmName: branch })} onClose={onClose}>
      {error ? <p className="text-danger">{error}</p> : info && <>
        <p>Xóa nhánh <span className="font-mono text-fg">{branch}</span> khỏi <b>{repoName}</b> (chỉ trên máy này).</p>
        {info.merged
          ? <p className="text-fg-mute">Nhánh đã được merge vào nhánh hiện tại, xóa an toàn (<span className="font-mono">git branch -d</span>).</p>
          : <>
              <p className="text-behind">Nhánh còn <b>{info.unmerged}</b> commit chưa có trong nhánh hiện tại. Xóa xong những commit này chỉ còn tìm lại được qua reflog.</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Vẫn xóa (<span className="font-mono">git branch -D</span>)</label>
            </>}
        {info.upstream && <p className="text-fg-mute">Nhánh trên remote <span className="font-mono">{info.upstream}</span> không bị ảnh hưởng.</p>}
      </>}
    </ConfirmDialog>
  )
}

/** Xóa nhánh trên remote: cảnh báo riêng vì ảnh hưởng cả người khác. */
export function DeleteRemoteBranchDialog({ repoPath, repoName, refName, onClose }: Common & { refName: string }) {
  const [info, setInfo] = useState<{ remote: string; branch: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.action(repoPath, 'deleteRemoteBranch', { ref: refName, dryRun: true }).then((r) => setInfo(r.info as unknown as { remote: string; branch: string }), (e: Error) => setError(e.message))
  }, [repoPath, refName])
  return (
    <ConfirmDialog title="Xóa nhánh trên remote" confirmLabel="Xóa trên remote" confirmWord={info?.branch ?? refName} loading={!info && !error} disabled={!!error}
      onConfirm={() => runAction(repoPath, repoName, 'deleteRemoteBranch', { ref: refName, confirmName: info!.branch })} onClose={onClose}>
      {error ? <p className="text-danger">{error}</p> : info && <>
        <p>Chạy <span className="font-mono text-fg">git push {info.remote} --delete {info.branch}</span>.</p>
        <p className="text-behind">Nhánh biến mất trên <b>{info.remote}</b> với mọi người; MR / PR đang mở từ nhánh này có thể bị đóng. Thao tác này không hoàn tác được từ app.</p>
      </>}
    </ConfirmDialog>
  )
}

export function RenameBranchDialog({ repoPath, repoName, branch, existing, onClose }: Common & { branch: string; existing: string[] }) {
  const [name, setName] = useState(branch)
  const [busy, setBusy] = useState(false)
  const next = name.trim()
  const clash = existing.includes(next) && next !== branch
  const ok = !!next && next !== branch && !clash && !next.startsWith('-')
  const submit = async () => {
    if (!ok || busy) return
    setBusy(true)
    try { if (await runAction(repoPath, repoName, 'renameBranch', { from: branch, to: next })) onClose() } finally { setBusy(false) }
  }
  return (
    <Modal size="sm" onClose={onClose} titleId="rename-title" header={<h2 id="rename-title">Đổi tên nhánh</h2>}>
      <form className="flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <label className="flex flex-col gap-1 text-sm text-fg-mute">
          Tên mới cho <span className="font-mono text-fg">{branch}</span>
          <input className="font-mono" autoFocus spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={clash} />
        </label>
        {clash && <p className="text-sm text-danger">Đã có nhánh tên này.</p>}
        <p className="text-sm text-fg-mute">Chỉ đổi tên trên máy này; nhánh trên remote (nếu có) giữ tên cũ.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn primary" disabled={!ok || busy}>{busy ? <Spinner inline /> : 'Đổi tên'}</button>
        </div>
      </form>
    </Modal>
  )
}
