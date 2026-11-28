import { useEffect, useRef, useState } from 'react'
import { api, useLoad } from '../api'
import { ticketKey } from '../lib/jiraKey'
import { forgetNotified } from '../lib/jiraWatch'
import { setState, toast } from '../lib/store'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JiraAccountModal } from '../components/JiraAccountModal'
import { DetailDock, useDockMode } from '../components/DetailDock'
import { JiraPanel } from '../components/JiraPanel'
import { JiraFollows } from '../components/JiraFollows'
import { JiraKey, JiraStatus } from '../components/JiraChip'
import { ErrorBanner, Segmented, Spinner } from '../components/ui'

/** Trang Jira: ticket của tôi và đã ghim kèm thay đổi, account Jira. Chỉ đọc. */
export function JiraPage() {
  const accounts = useLoad(api.jiraAccounts, [], 0, 'jiraAccounts')
  const writable = new Set((accounts.data ?? []).filter((a) => a.write).map((a) => a.id))
  const hasAcc = (accounts.data?.length ?? 0) > 0
  const news = useLoad(async () => (hasAcc ? api.jiraNew() : { items: [], follows: [], errors: [] }), [hasAcc], 0)
  const [askWrite, setAskWrite] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [dockMode, setDockMode] = useDockMode('jira', 'panel')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [view, setView] = useState<'new' | 'pinned' | 'all'>('all')
  const search = useRef<HTMLInputElement>(null)
  // Phím "/" nhảy vào ô tìm (bỏ qua khi đang gõ ở ô khác)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); search.current?.focus() }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  const pin = async (key: string, on: boolean) => {
    try { await api.jiraPin(key, on); news.reload() } catch (x) { toast({ kind: 'err', title: 'Không ghim được', detail: (x as Error).message }) }
  }
  const seen = async (key?: string) => {
    const marks = Object.fromEntries((news.data?.items ?? []).filter((x) => !key || x.issue.key === key).map((x) => [x.issue.key, x.issue.updated]))
    try { await api.jiraSeen(marks); forgetNotified(key); news.reload(); setState({ jiraUnread: 0 }) } catch (x) { toast({ kind: 'err', title: 'Không đánh dấu được', detail: (x as Error).message }) }
  }
  const [adding, setAdding] = useState(false)
  const all = news.data?.items ?? []
  const needle = q.trim().toLowerCase()
  const shown = all.filter((x) => (view === 'new' ? x.events.length > 0 : view === 'pinned' ? x.pinned : true) &&
    (!needle || `${x.issue.key} ${x.issue.summary} ${x.issue.assignee ?? ''} ${x.issue.status ?? ''}`.toLowerCase().includes(needle)))
  const openItem = openKey ? all.find((x) => x.issue.key === openKey) : undefined
  // J / K chọn ticket kế / trước, P ghim, E đã xem (bỏ qua khi đang gõ)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || !shown.length) return
      const i = shown.findIndex((x) => x.issue.key === openKey)
      const cur = shown[i]
      const k = e.key.toLowerCase()
      if (k === 'j' || k === 'k') { e.preventDefault(); setOpenKey(shown[Math.max(0, Math.min(shown.length - 1, i < 0 ? 0 : i + (k === 'j' ? 1 : -1)))].issue.key) }
      else if (k === 'p' && cur) { e.preventDefault(); void pin(cur.issue.key, !cur.pinned) }
      else if (k === 'e' && cur) { e.preventDefault(); void seen(cur.issue.key) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })
  const qKey = ticketKey(q)
  const canPin = !!qKey && !all.some((x) => x.issue.key === qKey)
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
    <div className="relative flex min-h-0 flex-1">
    <div className="page min-w-0" style={{ padding: '24px 28px', gap: 16 }}>
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
            <Segmented label="Xem" value={view} onChange={setView} options={[
              { id: 'all', label: 'Tất cả', count: all.length }, { id: 'new', label: 'Có gì mới', count: all.filter((x) => x.events.length).length }, { id: 'pinned', label: 'Đã ghim', count: all.filter((x) => x.pinned).length }]} />
            <input ref={search} type="search" className="!h-8 w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tiêu đề, người, trạng thái — hoặc dán link / mã ticket để ghim  ( / )" aria-label="Tìm ticket"
              onKeyDown={(e) => { if (e.key === 'Enter' && canPin && qKey) void pin(qKey, true).then(() => setQ('')) }} />
            {canPin && qKey && <button className="btn sm self-start" onClick={() => void pin(qKey, true).then(() => setQ(''))}>Ghim {qKey} (Enter)</button>}
            <JiraFollows accounts={accounts.data ?? []} follows={news.data?.follows ?? []} onChanged={news.reload} />
            {news.loading && !news.data && <Spinner label="Đang tải ticket…" />}
            {news.error && <ErrorBanner onRetry={news.reload}>{news.error}</ErrorBanner>}
            {news.data?.errors.map((e) => <div key={e.accountId} className="banner err">{e.name}: {e.error}</div>)}
            {news.data && !shown.length && !news.data.errors.length && !canPin && <span className="text-[12.5px] text-fg-mute">Không có ticket nào khớp.</span>}
            {shown.map(({ issue: i, pinned, via, events }) => (
              <div key={i.key} className="flex flex-col gap-1 border-t border-border py-2 first:border-t-0">
                <div className="grid grid-cols-[84px_minmax(0,1fr)_auto_26px] items-center gap-3 text-[13px]">
                  <JiraKey issue={i} />
                  <button className="ghost min-w-0 truncate text-left !text-fg" title={i.summary + ' — xem chi tiết'} onClick={() => setOpenKey(i.key)}>{i.summary}</button>
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
    {openItem && (
      <DetailDock pageKey="jira" mode={dockMode} open onClose={() => setOpenKey(null)} label={'Chi tiết ' + openItem.issue.key} minW={380} maxW={720} defW={460}>
        <JiraPanel key={openItem.issue.key} issue={openItem.issue} events={openItem.events} onSeen={() => void seen(openItem.issue.key)} onClose={() => setOpenKey(null)} dock={{ mode: dockMode, onMode: setDockMode }} />
      </DetailDock>
    )}
    </div>
  )
}
