import { useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import type { ChangeRequest, ReviewThread } from '../types'
import { CollapsibleMarkdown, Markdown } from './Markdown'
import { Modal } from './Modal'
import { ApprovalChip, CiChip, ciTone, copyCrLink, CR_WORD, crRef, PROVIDER_LABEL, ProviderTag, safeUrl, ThreadChip } from './RemoteBits'
import { Chip, Icon, Segmented, Spinner } from './ui'

type ThreadFilter = 'open' | 'resolved' | 'all'

function Thread({ t, provider }: { t: ReviewThread; provider: ChangeRequest['provider'] }) {
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
    </div>
  )
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]"><span className="text-fg-mute">{label}</span><span className="flex items-center gap-1.5">{children}</span></div>
)

/** Chi tiết một MR / PR: trạng thái merge, reviewer, CI và danh sách thread review. */
export function RemoteDetailModal({ cr, onClose }: { cr: ChangeRequest; onClose: () => void }) {
  const d = useLoad(() => api.changeRequest(cr.key), [cr.key], 30000)
  const [filter, setFilter] = useState<ThreadFilter>('open')
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
            {shown.map((t) => <Thread key={t.id} t={t} provider={cr.provider} />)}
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
