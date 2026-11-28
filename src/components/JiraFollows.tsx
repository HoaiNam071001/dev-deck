import { useState } from 'react'
import { api } from '../api'
import { toast } from '../lib/store'
import type { JiraAccount, JiraFollow } from '../types'

/** Theo dõi việc của người khác: chọn người (tìm trong Jira) hoặc dán JQL. Chỉ lưu cục bộ, người kia không biết. */
export function JiraFollows({ accounts, follows, onChanged }: { accounts: JiraAccount[]; follows: JiraFollow[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'user' | 'jql'>('user')
  const [account, setAccount] = useState(accounts[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [jql, setJql] = useState('')
  const [found, setFound] = useState<{ id: string; name: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const acc = account || accounts[0]?.id || ''

  const fail = (title: string, e: unknown) => toast({ kind: 'err', title, detail: (e as Error).message })
  const search = async () => {
    setBusy(true)
    try { setFound(await api.jiraUsers(acc, q)) } catch (e) { fail('Không tìm được người', e) }
    setBusy(false)
  }
  const add = async (body: Parameters<typeof api.jiraFollow>[0]) => {
    setBusy(true)
    try { await api.jiraFollow({ ...body, account: acc }); toast({ kind: 'ok', title: 'Đã thêm theo dõi', detail: body.label || body.jql }); setFound(null); setQ(''); setJql(''); setOpen(false); onChanged() }
    catch (e) { fail('Không thêm được', e) }
    setBusy(false)
  }
  const remove = async (id: string) => {
    try { await api.jiraFollow({ action: 'remove', id }); onChanged() } catch (e) { fail('Không bỏ theo dõi được', e) }
  }

  return (
    <div className="flex flex-col gap-2 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-mute">Đang theo dõi:</span>
        {follows.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5" title={f.jql}>
            {f.label}
            <button className="ghost flex size-4 items-center justify-center text-fg-mute" aria-label={'Bỏ theo dõi ' + f.label} onClick={() => void remove(f.id)}>×</button>
          </span>
        ))}
        {!follows.length && <span className="text-fg-mute">chưa có ai</span>}
        <button className="btn sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Đóng' : '+ Theo dõi người / JQL'}</button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="seg" role="group" aria-label="Cách theo dõi">
            {(['user', 'jql'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'user' ? 'Theo người' : 'Theo JQL'}</button>)}
          </div>
          {accounts.length > 1 && <select value={acc} onChange={(e) => { setAccount(e.target.value); setFound(null) }} aria-label="Account Jira">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
          {mode === 'user'
            ? <>
                <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void search() }}>
                  <input className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên hoặc email người cần theo dõi" aria-label="Tìm người" />
                  <button className="btn sm" type="submit" disabled={busy || q.trim().length < 2}>Tìm</button>
                </form>
                {found?.length === 0 && <span className="text-fg-mute">Không thấy ai khớp.</span>}
                {found?.map((u) => <button key={u.id} className="btn sm justify-start" disabled={busy} onClick={() => void add({ userId: u.id, label: u.name })}>Theo dõi việc của {u.name}</button>)}
                <span className="text-[11.5px] text-fg-mute">Lấy các ticket giao cho người đó mà chưa Done.</span>
              </>
            : <>
                <textarea className="mono" rows={2} value={jql} onChange={(e) => setJql(e.target.value)} placeholder='sprint in openSprints() AND project = PG' aria-label="JQL" maxLength={500} spellCheck={false} />
                <button className="btn sm self-start" disabled={busy || !jql.trim()} onClick={() => void add({ jql: jql.trim(), label: jql.trim().slice(0, 40) })}>Theo dõi JQL này</button>
                <span className="text-[11.5px] text-fg-mute">Tối đa 30 ticket mỗi nhóm. JQL của Jira Cloud cần có điều kiện lọc (không để trống hoàn toàn).</span>
              </>}
        </div>
      )}
    </div>
  )
}
