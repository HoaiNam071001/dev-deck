import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { toast } from '../lib/store'
import type { RemoteAccount, RemoteProvider } from '../types'
import { Modal } from './Modal'
import { Spinner } from './ui'

const HELP: Record<RemoteProvider, { url: string; scope: string; link: string }> = {
  gitlab: { url: 'https://gitlab.example.com', scope: 'read_api', link: 'Trong GitLab: Avatar → Preferences → Access tokens → chọn scope read_api.' },
  github: { url: 'https://github.com (để trống nếu dùng github.com)', scope: 'repo (đọc)', link: 'Trong GitHub: Settings → Developer settings → Personal access tokens. Fine-grained: quyền Pull requests: Read, Contents: Read.' },
}

/** Thêm account GitLab / GitHub bằng Personal Access Token. Token được kiểm tra rồi lưu mã hóa trên máy, không gửi đi đâu khác ngoài chính server đó. */
export function RemoteAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: (a: RemoteAccount) => void }) {
  const [provider, setProvider] = useState<RemoteProvider>('gitlab')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const a = await api.addRemoteAccount({ provider, name: name.trim(), baseUrl: baseUrl.trim(), token: token.trim() })
      toast({ kind: 'ok', title: 'Đã thêm account', detail: `${a.name} · đăng nhập là ${a.user}` })
      onAdded(a); onClose()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  const h = HELP[provider]
  const needUrl = provider === 'gitlab'

  return (
    <Modal onClose={onClose} titleId="acct-title" header={<h2 id="acct-title">Thêm account GitLab / GitHub</h2>}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5 text-[12px]">
          <span className="text-fg-mute">Provider</span>
          <div className="seg" role="group" aria-label="Provider">
            {(['gitlab', 'github'] as const).map((p) => (
              <button key={p} type="button" aria-pressed={provider === p} className={provider === p ? 'on' : ''} onClick={() => { setProvider(p); setErr(null) }}>{p === 'gitlab' ? 'GitLab' : 'GitHub'}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">Tên hiển thị (tùy chọn)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={provider === 'gitlab' ? 'GitLab công ty' : 'GitHub cá nhân'} /></label>
        <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">Base URL{needUrl ? '' : ' (tùy chọn)'}</span>
          <input className="mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={h.url} spellCheck={false} required={needUrl} /></label>
        <label className="flex flex-col gap-1.5 text-[12px]"><span className="text-fg-mute">Personal Access Token · scope {h.scope}</span>
          <input type="password" className="mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="glpat-… / ghp_…" autoComplete="off" spellCheck={false} required /></label>
        <p className="text-[11.5px] leading-relaxed text-fg-mute">{h.link} Token chỉ cần quyền đọc; được mã hóa bằng khóa của hệ điều hành và chỉ gửi tới chính máy chủ trên.</p>
        {err && <div className="banner err" role="alert">{err}</div>}
        <div className="flex items-center justify-end gap-2">
          {busy && <Spinner label="Đang kiểm tra token…" />}
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn primary" disabled={busy || !token.trim()}>Kiểm tra &amp; lưu</button>
        </div>
      </form>
    </Modal>
  )
}
