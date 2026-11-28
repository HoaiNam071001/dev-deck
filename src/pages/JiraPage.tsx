import { useState, type FormEvent } from 'react'
import { api, useLoad } from '../api'
import { setState, toast } from '../lib/store'
import { JiraChip } from '../components/JiraChip'
import { ErrorBanner, Spinner } from '../components/ui'

/** Trang Jira: ticket của tôi và đã ghim kèm thay đổi, account Jira. Chỉ đọc. */
export function JiraPage() {
  const accounts = useLoad(api.jiraAccounts, [], 0, 'jiraAccounts')
  const hasAcc = (accounts.data?.length ?? 0) > 0
  const news = useLoad(async () => (hasAcc ? api.jiraNew() : { items: [], errors: [] }), [hasAcc], 0)
  const [pinKey, setPinKey] = useState('')
  const pin = async (key: string, on: boolean) => {
    try { await api.jiraPin(key, on); news.reload() } catch (x) { toast({ kind: 'err', title: 'Không ghim được', detail: (x as Error).message }) }
  }
  const seen = async (key?: string) => {
    try { await api.jiraSeen(key); news.reload(); setState({ jiraUnread: 0 }) } catch (x) { toast({ kind: 'err', title: 'Không đánh dấu được', detail: (x as Error).message }) }
  }
  const [kind, setKind] = useState<'cloud' | 'server'>('cloud')
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const a = await api.addJiraAccount({ baseUrl: baseUrl.trim(), kind, email: email.trim(), token: token.trim() })
      toast({ kind: 'ok', title: 'Đã thêm Jira', detail: `${a.name} · đăng nhập là ${a.user}` })
      setToken(''); accounts.reload()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
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
          <span className="text-[12px] text-fg-mute">Ticket giao cho bạn và ticket đã ghim, kèm thay đổi chưa xem. Chỉ đọc, không ghi gì lên Jira</span>
        </div>
      </header>
      <div className="flex max-w-[860px] flex-col gap-4">
        {accounts.error && <ErrorBanner onRetry={accounts.reload}>{accounts.error}</ErrorBanner>}
        {(accounts.data ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-[12.5px]">
            <span className="font-semibold">{a.name}</span>
            <span className="text-fg-mute">{a.kind === 'cloud' ? 'Cloud' : 'Server / DC'} · {a.user} · …{a.tokenHint}</span>
            <button className="btn ml-auto" onClick={() => void remove(a.id)}>Xóa</button>
          </div>
        ))}

        {hasAcc && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">Có gì mới · việc của tôi và ticket đã ghim</h3>
              {(news.data?.items.some((i) => i.events.length)) && <button className="btn sm ml-auto" onClick={() => void seen()}>Đã xem tất cả</button>}
            </div>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void pin(pinKey.trim().toUpperCase(), true).then(() => setPinKey('')) }}>
              <input className="mono w-40" value={pinKey} onChange={(e) => setPinKey(e.target.value)} placeholder="ABC-123" aria-label="Mã ticket cần ghim" spellCheck={false} />
              <button className="btn sm" type="submit" disabled={!/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(pinKey.trim())}>Ghim</button>
            </form>
            {news.loading && !news.data && <Spinner label="Đang tải ticket…" />}
            {news.error && <ErrorBanner onRetry={news.reload}>{news.error}</ErrorBanner>}
            {news.data?.errors.map((e) => <div key={e.accountId} className="banner err">{e.name}: {e.error}</div>)}
            {news.data && !news.data.items.length && !news.data.errors.length && <span className="text-[12.5px] text-fg-mute">Không có ticket nào đang giao cho bạn hoặc đã ghim.</span>}
            {news.data?.items.map(({ issue: i, pinned, events }) => (
              <div key={i.key} className="flex flex-col gap-1 border-t border-border pt-1.5 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <JiraChip issue={i} /><span className="min-w-0 truncate">{i.summary}</span>
                  <button className={'ghost ml-auto flex size-6 flex-none items-center justify-center ' + (pinned ? 'text-behind' : 'text-fg-mute')} aria-pressed={pinned} title={pinned ? 'Bỏ ghim' : 'Ghim để theo dõi'} aria-label={(pinned ? 'Bỏ ghim ' : 'Ghim ') + i.key} onClick={() => void pin(i.key, !pinned)}>{pinned ? '★' : '☆'}</button>
                </div>
                {events.map((e, n) => <div key={n} className="pl-3 text-[12px] text-fg-soft">{e.kind === 'comment' ? '💬 ' : '• '}{e.text}</div>)}
                {events.length > 0 && <button className="btn sm self-start" onClick={() => void seen(i.key)}>Đánh dấu đã xem</button>}
              </div>
            ))}
          </section>
        )}

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 border-t border-border pt-3">
          <h3 className="text-[13px] font-semibold">Thêm account Jira</h3>
          <div className="seg" role="group" aria-label="Loại Jira">
            {(['cloud', 'server'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'cloud' ? 'Cloud' : 'Server / Data Center'}</button>)}
          </div>
          <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">Base URL</span>
            <input className="mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={kind === 'cloud' ? 'https://ten.atlassian.net' : 'https://jira.congty.com'} spellCheck={false} required /></label>
          {kind === 'cloud' && <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required /></label>}
          <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">{kind === 'cloud' ? 'API token' : 'Personal Access Token'}</span>
            <input type="password" className="mono" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} required /></label>
          <p className="text-[11.5px] leading-relaxed text-fg-mute">Chỉ đọc ticket. Token được mã hóa bằng khóa của hệ điều hành và chỉ gửi tới chính máy chủ Jira trên.</p>
          {err && <div className="banner err" role="alert">{err}</div>}
          <div className="flex items-center justify-end gap-2">
            {busy && <Spinner label="Đang kiểm tra…" />}
            <button type="submit" className="btn primary" disabled={busy || !token.trim() || !baseUrl.trim()}>Kiểm tra &amp; lưu</button>
          </div>
        </form>
      </div>
    </div>
  )
}
