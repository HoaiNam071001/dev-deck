import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { toast } from '../lib/store'
import type { JiraAccount } from '../types'
import { Modal } from './Modal'
import { Spinner } from './ui'

const HELP = {
  cloud: 'Tạo token tại https://id.atlassian.com/manage-profile/security/api-tokens (Create API token). Email là email đăng nhập Atlassian.',
  server: 'Trong Jira: avatar → Profile → Personal Access Tokens → Create token. Không cần email.',
}

/** Thêm account Jira (Cloud: email + API token; Server / Data Center: PAT). Token được kiểm tra rồi lưu mã hóa trên máy. */
export function JiraAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: (a: JiraAccount) => void }) {
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
      onAdded(a); onClose()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }

  return (
    <Modal onClose={onClose} titleId="jira-add-title" header={<h2 id="jira-add-title">Thêm account Jira</h2>}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 p-4">
        <div className="seg" role="group" aria-label="Loại Jira">
          {(['cloud', 'server'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setErr(null) }}>{k === 'cloud' ? 'Cloud' : 'Server / Data Center'}</button>)}
        </div>
        <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">Base URL</span>
          <input className="mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={kind === 'cloud' ? 'https://ten.atlassian.net' : 'https://jira.congty.com'} spellCheck={false} required /></label>
        {kind === 'cloud' && <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required /></label>}
        <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">{kind === 'cloud' ? 'API token' : 'Personal Access Token'}</span>
          <input type="password" className="mono" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} required /></label>
        <p className="text-[11.5px] leading-relaxed text-fg-mute">{HELP[kind]} Token được mã hóa bằng khóa của hệ điều hành và chỉ gửi tới chính máy chủ Jira trên. Mặc định chỉ đọc; muốn chuyển trạng thái, comment, ghi giờ thì token cần quyền ghi rồi bật ghi ở account.</p>
        {err && <div className="banner err" role="alert">{err}</div>}
        <div className="flex items-center justify-end gap-2">
          {busy && <Spinner label="Đang kiểm tra…" />}
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn primary" disabled={busy || !token.trim() || !baseUrl.trim()}>Kiểm tra &amp; lưu</button>
        </div>
      </form>
    </Modal>
  )
}
