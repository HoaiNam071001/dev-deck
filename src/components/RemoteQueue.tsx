import { useMemo, useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import { usePersisted } from '../lib/persist'
import { REVIEW_STATE_LABEL, reviewQueue, reviewState, sizeLines, waitHours, waitLevel, waitSince, type ReviewState, type WaitLevel } from '../lib/reviewQueue'
import type { ChangeRequest } from '../types'
import { RemoteDetailModal } from './RemoteDetail'
import { ApprovalChip, CiChip, crRef, ProviderTag, ThreadChip } from './RemoteBits'
import { ErrorBanner, Chip, Spinner } from './ui'

const TONE: Record<WaitLevel, 'ok' | 'behind' | 'danger'> = { ok: 'ok', warn: 'behind', late: 'danger' }
const STATE_TONE: Record<ReviewState, 'muted' | 'info' | 'ok' | 'danger'> = { new: 'muted', reviewing: 'info', waiting: 'ok', again: 'danger' }

function hoursText(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} phút`
  if (h < 48) return `${Math.round(h)} giờ`
  return `${Math.round(h / 24)} ngày`
}

/** Hàng đợi review: MR / PR người khác đang chờ tôi, chờ lâu nhất trước. */
export function RemoteQueue({ account, refreshMs }: { account: string; refreshMs: number }) {
  const res = useLoad(() => api.changeRequests(account, 'review', 'opened'), [account], refreshMs, `crs:${account}:review:opened`)
  const queue = useMemo(() => reviewQueue(res.data?.items ?? []), [res.data])
  const now = Date.now()
  const [open, setOpen] = useState<ChangeRequest | null>(null)
  // Dấu "đang xem" do tôi tự đặt, nhớ theo khóa MR / PR
  const [marks, setMarks] = usePersisted<Record<string, true>>('remotes.reviewing', {}, (v) => !!v && typeof v === 'object' && !Array.isArray(v))
  const toggleMark = (k: string) => { const n = { ...marks }; if (n[k]) delete n[k]; else n[k] = true; setMarks(n) }

  return (
    <div className="flex flex-col gap-3">
      {open && <RemoteDetailModal key={open.key} cr={open} onClose={() => setOpen(null)} />}
      <div className="text-[12px] text-fg-mute">
        Chỉ MR / PR đang mở mà bạn được yêu cầu review, chờ lâu nhất trước (draft xuống cuối). Màu: dưới 4 giờ bình thường, 4–24 giờ vàng, trên 24 giờ đỏ.
      </div>
      {res.error && <ErrorBanner onRetry={res.reload}>Không tải được hàng đợi: {res.error}</ErrorBanner>}
      {res.data?.errors.map((e) => <div key={e.accountId} className="banner err" role="alert">{e.name}: {e.error}</div>)}
      {res.loading && !res.data && <Spinner label="Đang lấy hàng đợi review…" />}
      {res.data && !queue.length && !res.loading && <div className="banner">Không có MR / PR nào đang chờ bạn review.</div>}
      {queue.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-border bg-surface" role="list" aria-label="Hàng đợi review">
          {queue.map((c) => {
            const h = waitHours(c, now)
            const since = waitSince(c)
            const lines = sizeLines(c)
            const st = reviewState(c, !!marks[c.key])
            return (
              <div role="listitem" key={c.key} className="flex items-center border-b border-line last:border-b-0 hover:bg-[#1F2124]">
                <button type="button" onClick={() => setOpen(c)} aria-haspopup="dialog"
                  className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-2.5 text-left">
                  <ProviderTag provider={c.provider} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {c.draft && <Chip tone="muted">Draft</Chip>}
                      <span className="truncate text-[13.5px] font-semibold" title={c.title}>{c.title}</span>
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-fg-mute">
                      <span className="mono">{crRef(c)}</span>·<span className="truncate" title={c.project}>{c.project}</span>·<span className="truncate">{c.author.name}</span>
                    </span>
                  </span>
                  <span className="flex flex-none items-center gap-1.5 whitespace-nowrap max-md:hidden">
                    <Chip tone={STATE_TONE[st]} title="Trạng thái riêng của bạn">{REVIEW_STATE_LABEL[st]}</Chip>
                    <CiChip ci={c.ci} />
                    <ApprovalChip a={c.approvals} />
                    <ThreadChip t={c.threads} />
                    {c.conflict && <Chip tone="danger">Conflict</Chip>}
                  </span>
                  <span className="mono w-[96px] flex-none text-right text-[11.5px] text-fg-mute max-lg:hidden"
                    title={c.size ? `${c.size.files ?? '?'} tệp` + (lines !== null ? `, +${c.size.additions} −${c.size.deletions}` : '') : 'Remote không trả độ lớn'}>
                    {lines !== null ? `${lines} dòng` : c.size?.files != null ? `${c.size.files} tệp` : '–'}
                  </span>
                  <span className="w-[84px] flex-none text-right">
                    <Chip tone={TONE[waitLevel(h)]} title={`${since.exact ? 'Tính từ lúc bạn được yêu cầu review' : 'Remote không có mốc yêu cầu review, tính từ lúc tạo'}: ${new Date(since.at).toLocaleString('vi-VN')} (${relTime(since.at)})`}>
                      {hoursText(h)}{since.exact ? '' : '*'}
                    </Chip>
                  </span>
                </button>
                <button type="button" className={"btn sm mr-3 flex-none whitespace-nowrap " + (st === "reviewing" ? "primary" : "")} disabled={st === "waiting" || st === "again"} aria-pressed={st === "reviewing"}
                  title={st === "waiting" || st === "again" ? "Trạng thái lấy từ review của bạn trên remote" : "Đánh dấu bạn đang xem MR / PR này"} onClick={() => toggleMark(c.key)}>{st === "reviewing" ? "Đang xem" : "Đánh dấu xem"}</button>
              </div>
            )
          })}
        </div>
      )}
      {queue.length > 0 && <div className="text-[12px] text-fg-mute">{queue.length} mục · dấu * = tính từ lúc tạo (GitLab chưa có mốc yêu cầu review)</div>}
    </div>
  )
}
