import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { baseName } from '../lib/repo'
import { bump, toast } from '../lib/store'
import type { BulkCleanupPlan, BulkCleanupResult, BulkPullPlan, BulkPullResult, RepoSummary } from '../types'
import { Modal } from './Modal'
import { Chip, Segmented, Spinner } from './ui'

export type BulkKind = 'pull' | 'cleanup'
type Scope = 'all' | 'filtered' | 'ticked'

/** "Pull tất cả" và "Dọn nhánh đã merge": xem trước theo từng repo, bỏ tick được, rồi mới chạy. */
export function BulkDialog({ kind, all, filtered, ticked = [], onClose }: { kind: BulkKind; all: RepoSummary[]; filtered: RepoSummary[]; ticked?: string[]; onClose: () => void }) {
  const [scope, setScope] = useState<Scope>(ticked.length ? 'ticked' : filtered.length === all.length ? 'all' : 'filtered')
  const tickedRepos = useMemo(() => all.filter((r) => ticked.includes(r.path)), [all, ticked])
  const repos = useMemo(() => (scope === 'all' ? all : scope === 'ticked' ? tickedRepos : filtered).filter((r) => !r.error), [scope, all, filtered, tickedRepos])
  // Danh sách repo tự làm mới nền: chỉ lập lại kế hoạch khi tập repo thật sự đổi (tránh mất các ô đã bỏ tick)
  const key = repos.map((r) => r.path).join('\n')
  const names = useMemo(() => new Map(all.map((r) => [r.path, r.name])), [all])
  const nameOf = (p: string) => names.get(p) ?? baseName(p)

  const [plan, setPlan] = useState<(BulkPullPlan | BulkCleanupPlan)[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [off, setOff] = useState<Set<string>>(new Set())   // dòng đã bỏ tick: path hoặc path\0nhánh
  const [word, setWord] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<(BulkPullResult | BulkCleanupResult)[] | null>(null)

  useEffect(() => {
    let live = true
    setPlan(null); setError(null); setOff(new Set()); setWord('')
    api.bulk<(BulkPullPlan | BulkCleanupPlan)[]>({ action: kind === 'pull' ? 'pullPlan' : 'cleanupPlan', paths: key ? key.split('\n') : [] })
      .then((p) => live && setPlan(p), (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [kind, key])

  const flip = (k: string) => setOff((s) => { const n = new Set(s); if (!n.delete(k)) n.add(k); return n })
  const pullPlan = kind === 'pull' ? (plan as BulkPullPlan[] | null) : null
  const cleanPlan = kind === 'cleanup' ? (plan as BulkCleanupPlan[] | null) : null
  const pullPicked = pullPlan?.filter((p) => p.eligible && !off.has(p.path)) ?? []
  const cleanPicked = (cleanPlan ?? []).map((p) => ({ path: p.path, branches: p.branches.filter((b) => !off.has(p.path + '\0' + b)) })).filter((p) => p.branches.length)
  const cleanTotal = cleanPicked.reduce((n, p) => n + p.branches.length, 0)
  const count = kind === 'pull' ? pullPicked.length : cleanTotal
  const confirmed = kind === 'pull' || word.trim() === String(cleanTotal)

  async function go() {
    setRunning(true)
    try {
      const r = kind === 'pull'
        ? await api.bulk<BulkPullResult[]>({ action: 'pullRun', paths: pullPicked.map((p) => p.path) })
        : await api.bulk<BulkCleanupResult[]>({ action: 'cleanupRun', items: cleanPicked, confirmCount: cleanTotal })
      setResult(r)
    } catch (e) { toast({ kind: 'err', title: 'Không chạy được', detail: (e as Error).message }) }
    finally { setRunning(false); bump() }
  }

  const title = kind === 'pull' ? 'Pull tất cả' : 'Dọn nhánh đã merge'
  const skipped = pullPlan?.filter((p) => !p.eligible) ?? []
  return (
    <Modal onClose={onClose} header={title}>
      {result ? <Results kind={kind} result={result} nameOf={nameOf} onClose={onClose} /> : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Segmented<Scope> label="Phạm vi" value={scope} onChange={setScope} options={[{ id: 'all', label: 'Tất cả repo', count: all.length }, { id: 'filtered', label: 'Repo đang lọc', count: filtered.length }, ...(ticked.length ? [{ id: 'ticked' as const, label: 'Repo đã tick', count: tickedRepos.length }] : [])]} />
          </div>
          <p className="m-0 text-fg-mute">
            {kind === 'pull'
              ? 'Chỉ repo sạch, có upstream, đang chậm so với remote và không có commit chưa push. Dùng pull --ff-only.'
              : 'Nhánh local đã merge vào nhánh mặc định. Bỏ qua nhánh hiện tại, nhánh mặc định, nhánh đang mở trong worktree và nhánh mới tạo chưa có commit. Xóa bằng -d (không bao giờ -D); nhánh remote không bị đụng.'}
          </p>
          {error && <p className="text-danger">{error}</p>}
          {!plan && !error && <p className="flex items-center gap-2 text-fg-mute"><Spinner inline />Đang kiểm tra {repos.length} repo…</p>}
          {pullPlan && (
            <>
              <ul className="m-0 flex list-none flex-col p-0" aria-label="Repo sẽ pull">
                {pullPlan.filter((p) => p.eligible).map((p) => (
                  <li key={p.path}><label className="flex cursor-pointer items-center gap-2 py-1">
                    <input type="checkbox" checked={!off.has(p.path)} onChange={() => flip(p.path)} />
                    <span className="font-medium">{nameOf(p.path)}</span>
                    <span className="font-mono text-fg-soft">{p.branch}</span>
                    <span className="font-mono text-behind">↓{p.behind}</span>
                  </label></li>
                ))}
              </ul>
              {!pullPicked.length && !pullPlan.some((p) => p.eligible) && <p className="text-fg-mute">Không có repo nào cần pull.</p>}
              {skipped.length > 0 && (
                <details><summary className="cursor-pointer text-fg-mute">{skipped.length} repo bị bỏ qua</summary>
                  <ul className="m-0 mt-1 list-none p-0 text-sm text-fg-mute">{skipped.map((p) => <li key={p.path}><span className="text-fg">{nameOf(p.path)}</span> · {p.reason}</li>)}</ul>
                </details>
              )}
            </>
          )}
          {cleanPlan && (
            <>
              {cleanPlan.filter((p) => p.branches.length).map((p) => (
                <div key={p.path}>
                  <div className="font-medium">{nameOf(p.path)} <span className="font-mono text-fg-mute">→ {p.base}</span></div>
                  <ul className="m-0 list-none p-0">{p.branches.map((b) => (
                    <li key={b}><label className="flex cursor-pointer items-center gap-2 py-0.5 pl-3">
                      <input type="checkbox" checked={!off.has(p.path + '\0' + b)} onChange={() => flip(p.path + '\0' + b)} /><span className="font-mono">{b}</span>
                    </label></li>
                  ))}</ul>
                </div>
              ))}
              {!cleanPlan.some((p) => p.branches.length) && <p className="text-fg-mute">Không có nhánh nào đã merge để dọn.</p>}
              {cleanPlan.some((p) => p.reason) && (
                <details><summary className="cursor-pointer text-fg-mute">Repo không kiểm tra được</summary>
                  <ul className="m-0 mt-1 list-none p-0 text-sm text-fg-mute">{cleanPlan.filter((p) => p.reason).map((p) => <li key={p.path}><span className="text-fg">{nameOf(p.path)}</span> · {p.reason}</li>)}</ul>
                </details>
              )}
              {cleanTotal > 0 && (
                <label className="flex items-center gap-2">Gõ <b className="font-mono">{cleanTotal}</b> để xác nhận xóa {cleanTotal} nhánh
                  <input value={word} onChange={(e) => setWord(e.target.value)} inputMode="numeric" aria-label="Gõ số nhánh để xác nhận" className="w-20" />
                </label>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Hủy</button>
            <button type="button" className={'btn ' + (kind === 'pull' ? 'primary' : 'danger')} disabled={!plan || !count || !confirmed || running} onClick={go}>
              {running ? <><Spinner inline />Đang chạy…</> : kind === 'pull' ? `Pull ${count} repo` : `Xóa ${count} nhánh`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Results({ kind, result, nameOf, onClose }: { kind: BulkKind; result: (BulkPullResult | BulkCleanupResult)[]; nameOf: (p: string) => string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Kết quả">
        {kind === 'pull'
          ? (result as BulkPullResult[]).map((r) => (
            <li key={r.path} className="flex items-start gap-2">
              <Chip tone={r.status === 'ok' ? 'ok' : r.status === 'skipped' ? 'muted' : 'danger'}>{r.status === 'ok' ? 'ok' : r.status === 'skipped' ? 'bỏ qua' : 'lỗi'}</Chip>
              <span className="font-medium">{nameOf(r.path)}</span><span className="min-w-0 flex-1 text-fg-mute">{r.message}</span>
            </li>))
          : (result as BulkCleanupResult[]).map((r) => (
            <li key={r.path} className="flex items-start gap-2">
              <Chip tone={r.failed.length ? 'danger' : 'ok'}>{r.failed.length ? 'có lỗi' : 'ok'}</Chip>
              <span className="font-medium">{nameOf(r.path)}</span>
              <span className="min-w-0 flex-1 text-fg-mute">đã xóa {r.done.length}{r.failed.map((f) => ` · ${f.branch}: ${f.message}`).join('')}</span>
            </li>))}
      </ul>
      <div className="flex justify-end"><button type="button" className="btn primary" onClick={onClose}>Đóng</button></div>
    </div>
  )
}
