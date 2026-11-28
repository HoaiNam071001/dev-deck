import { useState, type FormEvent } from 'react'
import { api, useLoad } from '../api'
import { toast } from '../lib/store'
import { Modal } from './Modal'
import { JiraChip } from './JiraChip'
import { ErrorBanner, Spinner } from './ui'

/** Account Jira (thêm / xóa) và "Việc của tôi". Chỉ đọc. */
export function JiraModal({ onClose }: { onClose: () => void }) {
  const accounts = useLoad(api.jiraAccounts, [], 0, 'jiraAccounts')
  const hasAcc = (accounts.data?.length ?? 0) > 0
  const mine = useLoad(async () => (hasAcc ? api.jiraMine() : { items: [], errors: [] }), [hasAcc], 0)
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
    <Modal onClose={onClose} titleId="jira-acct-title" size="wide" header={<h2 id="jira-acct-title">Jira</h2>}>
      <div className="flex flex-col gap-4 p-4">
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
            <h3 className="text-[13px] font-semibold">Việc của tôi</h3>
            {mine.loading && !mine.data && <Spinner label="Đang tải ticket…" />}
            {mine.error && <ErrorBanner onRetry={mine.reload}>{mine.error}</ErrorBanner>}
            {mine.data?.errors.map((e) => <div key={e.accountId} className="banner err">{e.name}: {e.error}</div>)}
            {mine.data && !mine.data.items.length && !mine.data.errors.length && <span className="text-[12.5px] text-fg-mute">Không có ticket nào đang giao cho bạn.</span>}
            {mine.data?.items.map((i) => (
              <div key={i.key} className="flex items-center gap-2 text-[12.5px]">
                <JiraChip issue={i} /><span className="min-w-0 truncate">{i.summary}</span>
                {i.priority && <span className="ml-auto flex-none text-fg-mute">{i.priority}</span>}
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
    </Modal>
  )
}
