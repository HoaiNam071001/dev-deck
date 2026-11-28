import { useEffect, useRef, useState } from 'react'
import { api, useLoad } from '../api'
import { ticketKey } from '../lib/jiraKey'
import { forgetNotified } from '../lib/jiraWatch'
import { notifyEnabled } from '../lib/platform'
import { setState, toast } from '../lib/store'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JiraAccountModal } from '../components/JiraAccountModal'
import { DetailDock, useDockMode } from '../components/DetailDock'
import { JiraPanel } from '../components/JiraPanel'
import { JiraFollows } from '../components/JiraFollows'
import { JiraKey, JiraStatus } from '../components/JiraChip'
import { SideSlot } from '../components/Shell'
import { ErrorBanner, Icon, NavLabel, Spinner } from '../components/ui'

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
  const [view, setView] = useState<'new' | 'mine' | 'pinned' | 'all'>('all')
  const [addFollow, setAddFollow] = useState(false)
  const [bell, setBell] = useState(false)
  const [notify, setNotify] = useState(notifyEnabled)
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
  const shown = all.filter((x) => (view === 'new' ? x.events.length > 0 : view === 'mine' ? !x.pinned && !x.via.length : view === 'pinned' ? x.pinned : true) &&
    (!needle || `${x.issue.key} ${x.issue.summary} ${x.issue.assignee ?? ''} ${x.issue.status ?? ''}`.toLowerCase().includes(needle)))
  const openItem = openKey ? all.find((x) => x.issue.key === openKey) : undefined
  // J / K chọn ticket kế / trước, P ghim, E đã xem (bỏ qua khi đang gõ)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || !shown.length || document.querySelector('dialog[open]')) return
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
  // Esc đóng chuông thông báo
  useEffect(() => {
    if (!bell) return
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setBell(false) }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [bell])
  const unseen = all.filter((x) => x.events.length)
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

  const follows = news.data?.follows ?? []
  const removeFollow = async (id: string) => { try { await api.jiraFollow({ action: 'remove', id }); news.reload() } catch (x) { toast({ kind: 'err', title: 'Không bỏ theo dõi được', detail: (x as Error).message }) } }
  const views = [['new', 'Có gì mới', unseen.length], ['mine', 'Việc của tôi', all.filter((x) => !x.pinned && !x.via.length).length], ['pinned', 'Đã ghim', all.filter((x) => x.pinned).length], ['all', 'Tất cả', all.length]] as const

  return (
    <>
    <SideSlot>
      <div className="side-group">
        <NavLabel>Xem</NavLabel>
        {views.map(([id, label, n]) => <button key={id} className={'nav-item' + (view === id ? ' on' : '')} aria-pressed={view === id} onClick={() => setView(id)}>{label}<span className="nav-n">{n}</span></button>)}
      </div>
      {hasAcc && (
        <div className="side-group">
          <NavLabel action={<button className="ghost flex size-[22px] items-center justify-center" aria-label="Thêm theo dõi" title="Theo dõi người / JQL" onClick={() => setAddFollow(true)}><Icon name="plus" size={13} /></button>}>Theo dõi</NavLabel>
          {follows.map((f) => (
            <div key={f.id} className="group relative">
              <span className="nav-item" title={f.jql}><span className="truncate">{f.label}</span></span>
              <button className="ghost invisible absolute right-1 top-0.5 flex size-[22px] items-center justify-center focus-visible:visible group-hover:visible" aria-label={'Bỏ theo dõi ' + f.label} onClick={() => void removeFollow(f.id)}><Icon name="x" size={12} /></button>
            </div>
          ))}
          {!follows.length && <span className="px-2 text-sm text-fg-mute">Chưa theo dõi ai</span>}
        </div>
      )}
      <div className="side-group">
        <NavLabel>Account</NavLabel>
        {(accounts.data ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-2 px-2 py-1 text-[12px]">
            <span className="min-w-0 flex-1 truncate" title={`${a.kind === 'cloud' ? 'Cloud' : 'Server / DC'} · ${a.user} · …${a.tokenHint}`}>{a.name}</span>
            <button className="btn sm" aria-pressed={a.write} title={a.write ? 'Đang cho phép ghi: bấm để về chỉ đọc' : 'Bật chuyển trạng thái, comment, ghi giờ'} onClick={() => (a.write ? void setWrite(a.id, false) : setAskWrite(a.id))}>{a.write ? '✎ ghi' : 'chỉ đọc'}</button>
            <button className="ghost flex size-5 items-center justify-center" aria-label={'Xóa account ' + a.name} title="Xóa account và token khỏi máy" onClick={() => void remove(a.id)}><Icon name="x" size={11} /></button>
          </div>
        ))}
      </div>
    </SideSlot>
    <div className="relative flex min-h-0 flex-1">
    <div className="page min-w-0" style={{ padding: '24px 28px', gap: 16 }}>
      <header className="page-h !items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1>Jira</h1>
          <span className="text-[12px] text-fg-mute">Ticket giao cho bạn và ticket đã ghim, kèm thay đổi chưa xem. Mặc định chỉ đọc; muốn chuyển trạng thái, comment, ghi giờ thì bật ghi cho account</span>
        </div>
        <div className="relative flex flex-none items-center gap-2">
          <button className="icon-btn" aria-label="Thay đổi chưa xem" aria-expanded={bell} title="Thay đổi chưa xem" onClick={() => setBell(!bell)} style={{ border: '1px solid var(--border-strong)' }}>
            <Icon name="bell" size={13} />{unseen.length > 0 && <span className="ml-1 font-mono text-[11px] text-behind">{unseen.length}</span>}
          </button>
          <button className="btn whitespace-nowrap" onClick={() => setAdding(true)}>+ Thêm account</button>
          {bell && (
            <div className="absolute top-9 right-0 z-30 flex max-h-[420px] w-[360px] flex-col gap-1 overflow-auto rounded-lg border border-border-pop bg-surface-2 p-2.5 shadow-[0_12px_32px_rgba(0,0,0,.5)]" role="dialog" aria-label="Thay đổi chưa xem">
              {unseen.map(({ issue: i, events }) => (
                <button key={i.key} className="ghost flex flex-col items-start gap-0.5 rounded px-1.5 py-1 text-left hover:bg-selected" onClick={() => { setOpenKey(i.key); setBell(false) }}>
                  <span className="text-[12px] !text-fg"><span className="font-mono text-fg-mute">{i.key}</span> {i.summary}</span>
                  {events.map((e, n) => <span key={n} className="text-[11.5px] text-fg-soft">{e.kind === 'comment' ? '💬 ' : '• '}{e.text}</span>)}
                </button>
              ))}
              {!unseen.length && <span className="px-1 text-[12px] text-fg-mute">Không có thay đổi chưa xem.</span>}
              <div className="mt-1 flex items-center gap-2 border-t border-line pt-2 text-[12px]">
                <label className="flex items-center gap-1.5 text-fg-soft"><input type="checkbox" checked={notify} onChange={(e) => { setNotify(e.target.checked); try { localStorage.setItem('notify', e.target.checked ? '1' : '0') } catch { /* bỏ qua */ } }} />Thông báo hệ thống</label>
                {unseen.length > 0 && <button className="btn sm ml-auto" onClick={() => { void seen(); setBell(false) }}>Đã xem tất cả</button>}
              </div>
            </div>
          )}
        </div>
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
        {hasAcc && (
          <section className="flex flex-col gap-2">
            <input ref={search} type="search" className="!h-8 w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tiêu đề, người, trạng thái — hoặc dán link / mã ticket để ghim  ( / )" aria-label="Tìm ticket"
              onKeyDown={(e) => { if (e.key === 'Enter' && canPin && qKey) void pin(qKey, true).then(() => setQ('')) }} />
            {canPin && qKey && <button className="btn sm self-start" onClick={() => void pin(qKey, true).then(() => setQ(''))}>Ghim {qKey} (Enter)</button>}
            <JiraFollows accounts={accounts.data ?? []} follows={news.data?.follows ?? []} onChanged={news.reload} open={addFollow} onOpen={setAddFollow} hideList />
            {news.loading && !news.data && <Spinner label="Đang tải ticket…" />}
            {news.error && <ErrorBanner onRetry={news.reload}>{news.error}</ErrorBanner>}
            {news.data?.errors.map((e) => <div key={e.accountId} className="banner err">{e.name}: {e.error}</div>)}
            {news.data && !shown.length && !news.data.errors.length && !canPin && <span className="text-[12.5px] text-fg-mute">Không có ticket nào khớp.</span>}
            <div className="overflow-hidden rounded-[10px] border border-border bg-surface" role="list" aria-label="Danh sách ticket">
            {shown.map(({ issue: i, pinned, via, events }) => (
              <div key={i.key} role="listitem" className={'flex flex-col gap-0.5 border-b border-line px-3.5 py-2 last:border-b-0 ' + (openKey === i.key ? 'bg-selected' : 'hover:bg-[#1F2124]')}>
                <div className="grid grid-cols-[8px_minmax(0,auto)_minmax(0,1fr)_auto_22px_26px] items-center gap-2.5 text-[13px]">
                  <span className={'size-1.5 rounded-full ' + (events.length ? 'bg-behind' : 'bg-transparent')} title={events.length ? 'Có thay đổi chưa xem' : undefined} />
                  <JiraKey issue={i} />
                  <button className="ghost min-w-0 truncate text-left !text-fg" title={i.summary + ' — xem chi tiết'} onClick={() => setOpenKey(i.key)}>{i.summary}</button>
                  <JiraStatus issue={i} writable={writable.has(i.accountId)} onChanged={news.reload} />
                  <span className="flex size-5 items-center justify-center rounded-full bg-raised text-[10px] font-semibold text-fg-soft" title={i.assignee || 'Chưa giao'} aria-hidden="true">{(i.assignee || '?').trim().charAt(0).toUpperCase()}</span>
                  <button className={'ghost flex size-6 items-center justify-center ' + (pinned ? 'text-behind' : 'text-fg-mute')} aria-pressed={pinned} title={pinned ? 'Bỏ ghim' : 'Ghim để theo dõi'} aria-label={(pinned ? 'Bỏ ghim ' : 'Ghim ') + i.key} onClick={() => void pin(i.key, !pinned)}>{pinned ? '★' : '☆'}</button>
                </div>
                <div className="truncate pl-[18px] text-[11.5px] text-fg-mute">
                  {events.length > 0
                    ? <span className="text-behind">{events.map((e) => e.text).join(' · ')}</span>
                    : [i.priority, i.sprint, via.length ? 'Theo dõi: ' + via.join(', ') : ''].filter(Boolean).join(' · ') || i.status}
                </div>
              </div>
            ))}
            </div>
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
    </>
  )
}
