import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { bump, setState, toast } from '../lib/store'
import type { CloneJob, DeleteRepoInfo, RepoSummary } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import { Spinner } from './ui'

const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]|[. ]$|^[.-]/
const nameError = (n: string) => (!n.trim() ? '' : n.length > 100 ? 'Tối đa 100 ký tự' : BAD_NAME.test(n.trim()) ? 'Tên không hợp lệ (không chứa / \\ : * ? " < > |, không bắt đầu bằng "." hoặc "-")' : '')

function ParentSelect({ roots, value, onChange }: { roots: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-fg-mute">
      Thư mục cha
      <select value={value} onChange={(e) => onChange(e.target.value)} className="font-mono">
        {roots.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </label>
  )
}

const footer = (onClose: () => void, submit: React.ReactNode) => <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn" onClick={onClose}>Hủy</button>{submit}</div>

export function NewRepoDialog({ roots, onClose }: { roots: string[]; onClose: () => void }) {
  const [parent, setParent] = useState(roots[0] ?? '')
  const [name, setName] = useState('')
  const [readme, setReadme] = useState(true)
  const [gitignore, setGitignore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bad = nameError(name)
  const ok = !!name.trim() && !bad && !!parent && !busy
  const submit = async () => {
    if (!ok) return
    setBusy(true); setError('')
    try {
      const r = await api.createRepo({ parent, name: name.trim(), readme, gitignore })
      toast({ kind: 'ok', title: 'Đã tạo repo ' + name.trim(), detail: r.path })
      setState({ selected: r.path }); bump(); onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal size="sm" onClose={onClose} titleId="newrepo-title" header={<h2 id="newrepo-title">Tạo repo mới</h2>}>
      <form className="flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <ParentSelect roots={roots} value={parent} onChange={setParent} />
        <label className="flex flex-col gap-1 text-sm text-fg-mute">
          Tên repo
          <input className="font-mono" autoFocus spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!bad} />
        </label>
        {bad && <p className="text-sm text-danger">{bad}</p>}
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} /> Tạo README.md</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={gitignore} onChange={(e) => setGitignore(e.target.checked)} /> Tạo .gitignore (node_modules, dist, .env…)</label>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {footer(onClose, <button type="submit" className="btn primary" disabled={!ok}>{busy ? <><Spinner inline />Đang tạo…</> : 'Tạo repo'}</button>)}
      </form>
    </Modal>
  )
}

/** "https://host/a/b.git" thành "b" để gợi ý tên thư mục. */
export const nameFromUrl = (u: string) => (u.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? '').replace(/\.git$/, '')
const URL_OK = /^(https:\/\/\S+|ssh:\/\/\S+|git@[\w.-]+:\S+)$/

export function CloneDialog({ roots, onClose }: { roots: string[]; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [parent, setParent] = useState(roots[0] ?? '')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [job, setJob] = useState<CloneJob | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<number>()
  const jobId = job?.id
  const running = job?.status === 'running'
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Hỏi tiến độ mỗi 600ms đến khi xong
  useEffect(() => {
    if (!jobId || !running) return
    const tick = async () => {
      try {
        const j = await api.cloneStatus(jobId)
        setJob(j)
        if (j.status === 'done') { toast({ kind: 'ok', title: 'Đã clone ' + j.name, detail: j.path }); setState({ selected: j.path }); bump(); onClose(); return }
        if (j.status === 'running') timer.current = window.setTimeout(tick, 600)
      } catch (e) { setError((e as Error).message); setJob(null) }
    }
    timer.current = window.setTimeout(tick, 600)
    return () => window.clearTimeout(timer.current)
  }, [jobId, running, onClose])

  const effName = touched ? name : nameFromUrl(url)
  const bad = nameError(effName)
  const urlOk = URL_OK.test(url.trim())
  const ok = urlOk && !!effName.trim() && !bad && !!parent && !running
  const start = async () => {
    if (!ok) return
    setError('')
    try { setJob(await api.cloneStart({ url: url.trim(), parent, name: effName.trim() })) } catch (e) { setError((e as Error).message) }
  }
  const cancel = async () => { if (job) try { setJob(await api.cloneCancel(job.id)) } catch (e) { setError((e as Error).message) } }
  const close = () => { if (running) void cancel(); onClose() }

  return (
    <Modal size="sm" onClose={close} titleId="clone-title" header={<h2 id="clone-title">Clone từ URL</h2>}>
      <form className="flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void start() }}>
        <label className="flex flex-col gap-1 text-sm text-fg-mute">
          URL repo
          <input className="font-mono" autoFocus spellCheck={false} disabled={running} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… · ssh://… · git@host:nhom/repo.git" aria-invalid={!!url && !urlOk} />
        </label>
        {!!url && !urlOk && <p className="text-sm text-danger">Chỉ nhận URL bắt đầu bằng https://, ssh:// hoặc git@</p>}
        <ParentSelect roots={roots} value={parent} onChange={setParent} />
        <label className="flex flex-col gap-1 text-sm text-fg-mute">
          Tên thư mục
          <input className="font-mono" spellCheck={false} disabled={running} value={effName} onChange={(e) => { setTouched(true); setName(e.target.value) }} aria-invalid={!!bad} />
        </label>
        {bad && <p className="text-sm text-danger">{bad}</p>}
        {job && (
          <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm text-fg-mute">
              <span>{job.status === 'cancelled' ? 'Đã hủy' : job.status === 'error' ? 'Lỗi' : job.phase}</span><span className="font-mono">{job.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-accent transition-[width]" style={{ width: job.percent + '%' }} /></div>
            {job.status === 'error' && <p className="text-sm text-danger">{job.error}</p>}
          </div>
        )}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={close}>{running ? 'Hủy clone' : 'Đóng'}</button>
          <button type="submit" className="btn primary" disabled={!ok}>{running ? <><Spinner inline />Đang clone…</> : 'Clone'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Xóa repo khỏi máy: dry-run liệt kê điều sẽ mất, gõ tên repo để xác nhận, chuyển vào Thùng rác. */
export function DeleteRepoDialog({ repo, onClose }: { repo: RepoSummary; onClose: () => void }) {
  const [info, setInfo] = useState<DeleteRepoInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.deleteRepo({ path: repo.path, dryRun: true }).then((r) => setInfo(r.info ?? null), (e: Error) => setError(e.message))
  }, [repo.path])
  const risks: string[] = []
  if (info) {
    if (info.dirty) risks.push(`${info.dirty} tệp thay đổi chưa commit`)
    if (info.unpushed.length) risks.push(`nhánh chưa push: ${info.unpushed.slice(0, 5).join(', ')}${info.unpushed.length > 5 ? ` và ${info.unpushed.length - 5} nhánh khác` : ''}`)
    if (info.stashes) risks.push(`${info.stashes} stash`)
    if (!info.hasRemote) risks.push('repo không có remote: toàn bộ lịch sử chỉ có trên máy này')
  }
  return (
    <ConfirmDialog title="Xóa repo khỏi máy" confirmLabel="Chuyển vào Thùng rác" confirmWord={repo.name} loading={!info && !error} disabled={!!error}
      onConfirm={async () => {
        try {
          await api.deleteRepo({ path: repo.path, confirmName: repo.name })
          toast({ kind: 'ok', title: 'Đã chuyển ' + repo.name + ' vào Thùng rác' })
          setState({ selected: null }); return true
        } catch (e) { toast({ kind: 'err', title: 'Không xóa được ' + repo.name, detail: (e as Error).message }); return false } finally { bump() }
      }} onClose={onClose}>
      {error ? <p className="text-danger">{error}</p> : info && <>
        <p>Chuyển thư mục <span className="font-mono text-fg break-all">{info.path}</span> vào Thùng rác. Remote không bị ảnh hưởng.</p>
        {risks.length
          ? <div className="rounded-md border border-behind/40 bg-behind/10 p-2.5 text-behind"><b>Sẽ mất nếu không khôi phục:</b><ul className="m-0 list-disc pl-5">{risks.map((r) => <li key={r}>{r}</li>)}</ul></div>
          : <p className="text-fg-mute">Không có thay đổi hay nhánh nào chưa push.</p>}
        <p className="text-fg-mute">Khôi phục từ Thùng rác nếu cần; app không xóa vĩnh viễn.</p>
      </>}
    </ConfirmDialog>
  )
}

