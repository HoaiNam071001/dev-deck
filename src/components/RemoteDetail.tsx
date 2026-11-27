import { useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import { toast } from '../lib/store'
import type { ChangeRequest, ReviewThread } from '../types'
import { CollapsibleMarkdown, Markdown } from './Markdown'
import { Modal } from './Modal'
import { ApprovalChip, CiChip, ciTone, copyCrLink, CR_WORD, crRef, PROVIDER_LABEL, ProviderTag, safeUrl, ThreadChip } from './RemoteBits'
import { Chip, Icon, Segmented, Spinner } from './ui'

type ThreadFilter = 'open' | 'resolved' | 'all'

/** Nút thao tác trên một thread (chỉ hiện khi account bật "cho phép ghi"): resolve / mở lại, trả lời. */
type ActFn = (action: 'resolve' | 'unresolve' | 'reply', threadId: string, body?: string) => Promise<boolean>
function ThreadActions({ t, onAct }: { t: ReviewThread; onAct: ActFn }) {
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (action: 'resolve' | 'unresolve' | 'reply', body?: string) => {
    setBusy(true)
    const ok = await onAct(action, t.id, body)
    setBusy(false)
    if (ok && action === 'reply') { setText(''); setReplying(false) }
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line px-3 py-2">
      {replying ? (
        <>
          <textarea className="min-h-[72px] w-full" aria-label="Nội dung trả lời" placeholder="Nội dung trả lời (gửi lên remote ngay, không sửa được từ đây)" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-1.5">
            <button className="btn sm" disabled={busy} onClick={() => { setReplying(false); setText('') }}>Hủy</button>
            <button className="btn sm primary" disabled={busy || !text.trim()} onClick={() => void run('reply', text)}>{busy ? 'Đang gửi…' : 'Gửi trả lời'}</button>
          </div>
        </>
      ) : (
        <div className="flex gap-1.5">
          <button className="btn sm" disabled={busy} onClick={() => setReplying(true)}>Trả lời</button>
          <button className="btn sm" disabled={busy} onClick={() => void run(t.resolved ? 'unresolve' : 'resolve')}>{busy ? 'Đang xử lý…' : t.resolved ? 'Mở lại thread' : 'Resolve'}</button>
        </div>
      )}
    </div>
  )
}

function Thread({ t, provider, onAct }: { t: ReviewThread; provider: ChangeRequest['provider']; onAct?: ActFn }) {
  return (
    <div className={'overflow-hidden rounded-[10px] border bg-surface ' + (t.resolved ? 'border-border opacity-80' : 'border-behind/45')}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <Chip tone={t.resolved ? 'ok' : 'behind'}>{t.resolved ? 'Đã resolve' : 'Chưa resolve'}</Chip>
        {t.outdated && <Chip tone="muted" title="Code đã đổi sau comment này">Cũ</Chip>}
        {t.path ? <span className="mono min-w-0 truncate text-[11.5px] text-fg-soft" title={t.path}>{t.path}{t.line ? ':' + t.line : ''}</span> : <span className="text-[12px] text-fg-mute">Thảo luận chung</span>}
        <span className="ml-auto text-[11.5px] text-fg-mute">{t.comments.length} comment</span>
      </div>
      {t.comments.map((c, i) => (
        <div key={i} className={'flex gap-2.5 px-3 py-2.5 ' + (i ? 'border-t border-line' : '')}>
          <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-raised text-[10px] font-semibold uppercase">{c.author.name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px]"><b className="font-semibold">{c.author.name}</b> <span className="text-fg-mute">· {relTime(c.createdAt)}</span>
              {safeUrl(c.url) && <> · <a className="text-ahead hover:underline" href={safeUrl(c.url)} target="_blank" rel="noopener noreferrer">mở trên {PROVIDER_LABEL[provider]}</a></>}</div>
            <div className="mt-1"><CollapsibleMarkdown text={c.body} /></div>
          </div>
        </div>
      ))}
      {onAct && <ThreadActions t={t} onAct={onAct} />}
    </div>
  )
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]"><span className="text-fg-mute">{label}</span><span className="flex items-center gap-1.5">{children}</span></div>
)

/** Chi tiết một MR / PR: trạng thái merge, reviewer, CI và danh sách thread review. */
/** Thao tác lên MR / PR (chỉ khi account bật ghi): approve, bỏ approve, merge. Merge cần bấm hai lần. */
function CrActions({ cr, onDone }: { cr: ChangeRequest; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const run = async (action: 'approve' | 'unapprove' | 'merge') => {
    if (action === 'merge' && !confirm) { setConfirm(true); return }
    setConfirm(false); setBusy(action)
    try {
      await api.remoteAct({ action, key: cr.key })
      toast({ kind: 'ok', title: action === 'merge' ? 'Đã merge ' + CR_WORD[cr.provider] + ' ' + crRef(cr) : action === 'approve' ? 'Đã approve' : 'Đã bỏ approve' })
      onDone()
    } catch (e) { toast({ kind: 'err', title: 'Không thực hiện được', detail: (e as Error).message }) }
    finally { setBusy(null) }
  }
  const warn = cr.conflict ? 'Đang có conflict' : cr.ci === 'failed' ? 'CI đang lỗi' : cr.draft ? 'Đang là draft' : cr.threads && cr.threads.total > cr.threads.resolved ? 'Còn thread chưa resolve' : ''
  return (
    <div className="rounded-[10px] border border-border bg-surface px-3.5 py-2">
      <div className="py-1 text-[13px] font-semibold">Thao tác</div>
      <div className="flex flex-wrap gap-1.5 py-1">
        <button className="btn sm" disabled={!!busy} onClick={() => void run('approve')}>{busy === 'approve' ? 'Đang gửi…' : 'Approve'}</button>
        {cr.provider === 'gitlab' && <button className="btn sm" disabled={!!busy} onClick={() => void run('unapprove')}>{busy === 'unapprove' ? 'Đang gửi…' : 'Bỏ approve'}</button>}
        <button className={'btn sm ' + (confirm ? 'danger' : '')} disabled={!!busy} onBlur={() => setConfirm(false)} onClick={() => void run('merge')}>{busy === 'merge' ? 'Đang merge…' : confirm ? 'Bấm lần nữa để merge' : 'Merge'}</button>
      </div>
      {confirm && <div className="pb-1 text-[11.5px] text-behind">Merge không hoàn tác được từ app.{warn ? ' Lưu ý: ' + warn + '.' : ''}</div>}
      {!confirm && warn && <div className="pb-1 text-[11.5px] text-fg-mute">{warn}: remote có thể từ chối merge.</div>}
    </div>
  )
}

/** Job test / build đang chạy ở máy này trên cùng nhánh, đặt cạnh trạng thái CI để đối chiếu. */
function LocalJobs({ cr }: { cr: ChangeRequest }) {
  const q = useLoad(() => api.remoteLocalJobs(cr.accountId, cr.project, cr.source), [cr.key], 15000)
  const d = q.data
  if (!d || !d.local) return null
  const ciWord: Record<string, string> = { success: 'pass', failed: 'lỗi', running: 'đang chạy', pending: 'chờ', canceled: 'hủy', none: 'chưa có' }
  return (
    <div className="rounded-[10px] border border-border bg-surface px-3.5 py-2">
      <div className="flex items-center justify-between py-1 text-[13px] font-semibold"><span>Chạy ở máy này</span><span className="text-[11.5px] font-normal text-fg-mute" title={d.local.path}>{d.local.name} · {cr.source}</span></div>
      {!d.jobs.length && <div className="py-1 text-[12px] text-fg-mute">Không có job nào đang chạy trên nhánh này. CI: {ciWord[cr.ci]}.</div>}
      {d.jobs.map((j) => {
        const p = j.progress
        const tone = p ? (p.fail > 0 ? 'danger' : p.finished ? 'ok' : 'info') : 'muted'
        return (
          <div key={j.pid} className="flex items-center gap-2 border-t border-line py-1.5 text-[12.5px] first:border-t-0">
            <Chip tone={tone}>{p ? (p.fail > 0 ? p.fail + ' lỗi' : p.finished ? 'xong' : p.done + '/' + p.total) : j.kind}</Chip>
            <span className="min-w-0 flex-1 truncate" title={j.cmd}>{j.name}</span>
            <span className="flex-none text-[11px] text-fg-mute">{relTime(j.start)}</span>
          </div>
        )
      })}
      {d.jobs.some((j) => j.progress && j.progress.fail > 0) && cr.ci === 'success' && <div className="pb-1 text-[11.5px] text-behind">Test local đang lỗi nhưng CI báo pass: kiểm tra lại cấu hình hoặc dữ liệu local.</div>}
      {d.jobs.some((j) => j.progress?.finished && j.progress.fail === 0) && cr.ci === 'failed' && <div className="pb-1 text-[11.5px] text-behind">Test local pass nhưng CI lỗi: xem log job lỗi bên trên (có thể khác môi trường).</div>}
    </div>
  )
}

export function RemoteDetailModal({ cr, onClose }: { cr: ChangeRequest; onClose: () => void }) {
  const d = useLoad(() => api.changeRequest(cr.key), [cr.key], 30000)
  const [filter, setFilter] = useState<ThreadFilter>('open')
  const accounts = useLoad(api.remoteAccounts, [])
  const canWrite = !!accounts.data?.find((a) => a.id === cr.accountId)?.write
  const act: ActFn = async (action, threadId, body) => {
    try {
      await api.remoteAct({ action, key: cr.key, threadId, body })
      toast({ kind: 'ok', title: action === 'reply' ? 'Đã gửi trả lời' : action === 'resolve' ? 'Đã resolve thread' : 'Đã mở lại thread' })
      d.reload()
      return true
    } catch (e) { toast({ kind: 'err', title: 'Không thực hiện được', detail: (e as Error).message }); return false }
  }
  const full = d.data ?? null
  const cur = full ?? cr
  const threads = full?.threadList ?? []
  const open = threads.filter((t) => !t.resolved)
  const shown = filter === 'open' ? open : filter === 'resolved' ? threads.filter((t) => t.resolved) : threads
  const url = safeUrl(cr.url)

  return (
    <Modal onClose={onClose} titleId="cr-title" size="wide" header={
      <h2 id="cr-title" className="flex min-w-0 items-center gap-2">
        <ProviderTag provider={cr.provider} />
        <span className="truncate">{cr.title}</span>
        <span className="mono flex-none text-[12px] font-normal text-fg-mute">{crRef(cr)}</span>
      </h2>
    }>
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-[12px] text-fg-mute">
          <span>{cr.project}</span>
          <span className="mono inline-flex items-center gap-1.5 text-fg-soft"><Icon name="git" size={11} />{cr.source}<span className="text-fg-mute">→</span>{cr.target}</span>
          <span>{cr.author.name} · cập nhật {relTime(cr.updatedAt)}</span>
          <span className="ml-auto flex gap-1.5">
            <button className="btn sm" onClick={() => void copyCrLink(cr)}><Icon name="copy" size={12} />Chép link</button>
            {url && <a className="btn sm" href={url} target="_blank" rel="noopener noreferrer">Mở trên {PROVIDER_LABEL[cr.provider]}</a>}
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 p-5 max-md:grid-cols-1">
          <section className="flex min-w-0 flex-col gap-2.5" aria-label="Thread review">
            <div className="flex items-center gap-2">
              <Segmented<ThreadFilter> label="Lọc thread" value={filter} onChange={setFilter} options={[
                { id: 'open', label: 'Chưa resolve', count: open.length }, { id: 'resolved', label: 'Đã resolve', count: threads.length - open.length }, { id: 'all', label: 'Tất cả', count: threads.length },
              ]} />
            </div>
            {d.loading && !full && <Spinner label="Đang tải thread…" />}
            {d.error && <div className="banner err" role="alert">Không tải được chi tiết: {d.error}</div>}
            {full && !shown.length && <div className="banner">{filter === 'open' ? (threads.length ? 'Không còn thread nào chưa resolve.' : 'Chưa có thread review nào.') : 'Không có thread nào.'}</div>}
            {shown.map((t) => <Thread key={t.id} t={t} provider={cr.provider} onAct={canWrite ? act : undefined} />)}
          </section>

          <aside className="flex min-w-0 flex-col gap-3" aria-label="Trạng thái">
            <div className="rounded-[10px] border border-border bg-surface px-3.5 py-2">
              <div className="py-1 text-[13px] font-semibold">Trạng thái {CR_WORD[cr.provider]}</div>
              <Row label="CI">{cur.ci === 'none' ? <span className="text-fg-mute">—</span> : <CiChip ci={cur.ci} />}</Row>
              <Row label="Approve">{cur.approvals ? <ApprovalChip a={cur.approvals} /> : <span className="text-fg-mute">—</span>}</Row>
              <Row label="Thread">{cur.threads && cur.threads.total ? <ThreadChip t={cur.threads} /> : <span className="text-fg-mute">Không có</span>}</Row>
              <Row label="Conflict">{cur.conflict === null ? <span className="text-fg-mute">chưa rõ</span> : cur.conflict ? <Chip tone="danger">Có conflict</Chip> : <Chip tone="ok">Không</Chip>}</Row>
              {full?.mergeStatus && <Row label="Merge"><span className="mono text-[11.5px] text-fg-soft">{full.mergeStatus}</span></Row>}
              {cr.draft && <Row label="Loại"><Chip tone="muted">Draft</Chip></Row>}
            </div>

            {canWrite && cur.state === 'opened' && <CrActions cr={cur} onDone={() => d.reload()} />}
            <LocalJobs cr={cr} />

            <div className="rounded-[10px] border border-border bg-surface px-3.5 py-2">
              <div className="py-1 text-[13px] font-semibold">Reviewer</div>
              {cur.reviewers.length ? cur.reviewers.map((r) => <div key={r.username || r.name} className="py-1 text-[12.5px]">{r.name}</div>) : <div className="py-1 text-[12px] text-fg-mute">Chưa gán reviewer</div>}
              {full && full.approvedBy.length > 0 && <div className="border-t border-line py-1.5 text-[12px] text-fg-mute">Đã approve: <span className="text-fg-soft">{full.approvedBy.join(', ')}</span></div>}
            </div>

            {full && full.checks.length > 0 && (
              <div className="rounded-[10px] border border-border bg-surface px-3.5 py-2">
                <div className="flex items-center justify-between py-1 text-[13px] font-semibold">
                  <span>{cr.provider === 'gitlab' ? 'Pipeline' : 'Checks'}</span>
                  {safeUrl(full.pipelineUrl) && <a className="text-[11.5px] font-normal text-ahead hover:underline" href={safeUrl(full.pipelineUrl)} target="_blank" rel="noopener noreferrer">mở</a>}
                </div>
                <div className="flex flex-wrap gap-1.5 py-1">
                  {full.checks.map((c) => <Chip key={c.name} tone={ciTone(c.status)} title={c.name}>{c.name.length > 26 ? c.name.slice(0, 25) + '…' : c.name}</Chip>)}
                </div>
              </div>
            )}

            {!!full?.failedJobs?.length && (
              <div className="rounded-[10px] border border-danger/40 bg-surface px-3.5 py-2">
                <div className="py-1 text-[13px] font-semibold">Job lỗi</div>
                {full.failedJobs.map((j) => (
                  <details key={j.id} className="border-t border-line py-1.5 first-of-type:border-t-0">
                    <summary className="cursor-pointer text-[12.5px]"><b className="font-semibold">{j.name}</b> <span className="text-fg-mute">· {j.stage}{j.reason ? ' · ' + j.reason : ''}</span></summary>
                    {j.log ? <pre className="mono mt-1.5 max-h-60 overflow-auto rounded-md bg-surface-2 p-2 text-[11px] leading-snug whitespace-pre-wrap">{j.log}</pre> : <div className="mt-1 text-[12px] text-fg-mute">Không đọc được log.</div>}
                    {safeUrl(j.url) && <a className="mt-1 inline-block text-[11.5px] text-ahead hover:underline" href={safeUrl(j.url)} target="_blank" rel="noopener noreferrer">mở job</a>}
                  </details>
                ))}
              </div>
            )}

            {full?.description && (
              <details className="rounded-[10px] border border-border bg-surface px-3.5 py-2">
                <summary className="cursor-pointer py-1 text-[13px] font-semibold">Mô tả</summary>
                <div className="mt-1 max-h-72 overflow-auto"><Markdown text={full.description} /></div>
              </details>
            )}
          </aside>
        </div>
      </div>
    </Modal>
  )
}
