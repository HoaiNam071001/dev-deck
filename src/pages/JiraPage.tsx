import { useState } from 'react'
import { api, useLoad } from '../api'
import { setState, toast } from '../lib/store'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JiraAccountModal } from '../components/JiraAccountModal'
import { JiraFollows } from '../components/JiraFollows'
import { JiraKey, JiraStatus } from '../components/JiraChip'
import { ErrorBanner, Spinner } from '../components/ui'

/** Trang Jira: ticket của tôi và đã ghim kèm thay đổi, account Jira. Chỉ đọc. */
export function JiraPage() {
  const accounts = useLoad(api.jiraAccounts, [], 0, 'jiraAccounts')
  const writable = new Set((accounts.data ?? []).filter((a) => a.write).map((a) => a.id))
  const hasAcc = (accounts.data?.length ?? 0) > 0
  const news = useLoad(async () => (hasAcc ? api.jiraNew() : { items: [], follows: [], errors: [] }), [hasAcc], 0)
  const [askWrite, setAskWrite] = useState<string | null>(null)
  const [pinKey, setPinKey] = useState('')
  const pin = async (key: string, on: boolean) => {
    try { await api.jiraPin(key, on); news.reload() } catch (x) { toast({ kind: 'err', title: 'Không ghim được', detail: (x as Error).message }) }
  }
  const seen = async (key?: string) => {
    try { await api.jiraSeen(key); news.reload(); setState({ jiraUnread: 0 }) } catch (x) { toast({ kind: 'err', title: 'Không đánh dấu được', detail: (x as Error).message }) }
  }
  const [adding, setAdding] = useState(false)
  const setWrite = async (id: string, on: boolean) => {
    try { await api.setJiraWrite(id, on); accounts.reload(); toast({ kind: 'ok', title: on ? 'Đã bật thao tác ghi' : 'Đã tắt thao tác ghi' }) }
    catch (x) { toast({ kind: 'err', title: 'Không đổi được', detail: (x as Error).message }); return false }
    return true
  }
  const remove = async (id: string) => {
    try { await api.removeJiraAccount(id); accounts.reload(); toast({ kind: 'ok', title: 'Đã xóa account Jira', detail: 'Token đã bị xóa khỏi máy.' }) }
    catch (x) { toast({ kind: 'err', title: 'Không xóa được', detail: (x as Error).message }) }
  }

  return (
    <div className="page" style={{ padding: '24px 28px', gap: 16 }}>
      <header className="page-h !items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1>Jira</h1>
          <span className="text-[12px] text-fg-mute">Ticket giao cho bạn và ticket đã ghim, kèm thay đổi chưa xem. Mặc định chỉ đọc; muốn chuyển trạng thái, comment, ghi giờ thì bật ghi cho account</span>
        </div>
        <button className="btn flex-none whitespace-nowrap" onClick={() => setAdding(true)}>+ Thêm account</button>
      </header>
      {adding && <JiraAccountModal onClose={() => setAdding(false)} onAdded={() => accounts.reload()} />}
      {askWrite && (
        <ConfirmDialog title="Cho phép ghi lên Jira?" confirmLabel="Bật ghi" danger={false} onClose={() => setAskWrite(null)} onConfirm={async () => { const ok = await setWrite(askWrite, true); if (ok) setAskWrite(null); return ok }}>
          <p className="text-[12.5px] leading-relaxed">DevDeck sẽ được chuyển trạng thái, gửi comment và ghi giờ làm trên ticket bằng token của account này. Mỗi thao tác đều ghi vào nhật ký (không lưu nội dung comment). Token cần quyền ghi trên Jira.</p>
        </ConfirmDialog>
      )}
      <div className="flex max-w-[860px] flex-col gap-4">
        {accounts.error && <ErrorBanner onRetry={accounts.reload}>{accounts.error}</ErrorBanner>}
        {accounts.data && !accounts.data.length && <p className="empty">Chưa có account Jira. Bấm “+ Thêm account” để kết nối.</p>}
        {(accounts.data ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-[12.5px]">
            <span className="font-semibold">{a.name}</span>
            <span className="text-fg-mute">{a.kind === 'cloud' ? 'Cloud' : 'Server / DC'} · {a.user} · …{a.tokenHint}</span>
            <button className="btn ml-auto" aria-pressed={a.write} title={a.write ? 'Đang cho phép ghi: bấm để quay về chỉ đọc' : 'Bật chuyển trạng thái, comment, ghi giờ'} onClick={() => (a.write ? void setWrite(a.id, false) : setAskWrite(a.id))}>{a.write ? '✎ Đang cho ghi' : 'Chỉ đọc'}</button>
            <button className="btn" onClick={() => void remove(a.id)}>Xóa</button>
          </div>
        ))}

        {hasAcc && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">Có gì mới · việc của tôi, ticket đã ghim và người đang theo dõi</h3>
              {(news.data?.items.some((i) => i.events.length)) && <button className="btn sm ml-auto" onClick={() => void seen()}>Đã xem tất cả</button>}
            </div>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void pin(pinKey.trim().toUpperCase(), true).then(() => setPinKey('')) }}>
              <input className="mono w-40" value={pinKey} onChange={(e) => setPinKey(e.target.value)} placeholder="ABC-123" aria-label="Mã ticket cần ghim" spellCheck={false} />
              <button className="btn sm" type="submit" disabled={!/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(pinKey.trim())}>Ghim</button>
            </form>
            <JiraFollows accounts={accounts.data ?? []} follows={news.data?.follows ?? []} onChanged={news.reload} />
            {news.loading && !news.data && <Spinner label="Đang tải ticket…" />}
            {news.error && <ErrorBanner onRetry={news.reload}>{news.error}</ErrorBanner>}
            {news.data?.errors.map((e) => <div key={e.accountId} className="banner err">{e.name}: {e.error}</div>)}
            {news.data && !news.data.items.length && !news.data.errors.length && <span className="text-[12.5px] text-fg-mute">Không có ticket nào đang giao cho bạn hoặc đã ghim.</span>}
            {news.data?.items.map(({ issue: i, pinned, via, events }) => (
              <div key={i.key} className="flex flex-col gap-1 border-t border-border py-2 first:border-t-0">
                <div className="grid grid-cols-[84px_minmax(0,1fr)_auto_26px] items-center gap-3 text-[13px]">
                  <JiraKey issue={i} />
                  <span className="truncate" title={i.summary}>{i.summary}</span>
                  <JiraStatus issue={i} writable={writable.has(i.accountId)} onChanged={news.reload} />
                  <button className={'ghost flex size-6 items-center justify-center ' + (pinned ? 'text-behind' : 'text-fg-mute')} aria-pressed={pinned} title={pinned ? 'Bỏ ghim' : 'Ghim để theo dõi'} aria-label={(pinned ? 'Bỏ ghim ' : 'Ghim ') + i.key} onClick={() => void pin(i.key, !pinned)}>{pinned ? '★' : '☆'}</button>
                </div>
                {(i.assignee || i.priority || i.sprint || via.length > 0) && <div className="pl-[96px] text-[11.5px] text-fg-mute">{[via.length ? 'Theo dõi: ' + via.join(', ') : '', i.assignee, i.priority, i.sprint].filter(Boolean).join(' · ')}</div>}
                {events.map((e, n) => <div key={n} className="pl-[96px] text-[12px] text-fg-soft">{e.kind === 'comment' ? '💬 ' : '• '}{e.text}</div>)}
                {events.length > 0 && <button className="btn sm ml-[96px] self-start" onClick={() => void seen(i.key)}>Đánh dấu đã xem</button>}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
