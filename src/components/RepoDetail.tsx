import { useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import { Spinner } from './Modal'
import type { FileChange, RepoSummary } from '../types'

type Tab = 'branches' | 'changes' | 'commits' | 'remotes'

const isStaged = (f: FileChange) => f.kind === 'change' && f.x !== '.'
const isUnstaged = (f: FileChange) => f.kind === 'untracked' || (f.kind === 'change' && f.y !== '.')

function fileLabel(f: FileChange): { text: string; cls: string } {
  if (f.kind === 'untracked') return { text: 'chưa theo dõi', cls: 'chip-untracked' }
  if (f.kind === 'conflict') return { text: 'xung đột', cls: 'chip-conflict' }
  const parts: string[] = []
  if (f.x !== '.') parts.push('staged')
  if (f.y !== '.') parts.push('sửa')
  return { text: parts.join(' + '), cls: f.x !== '.' && f.y === '.' ? 'chip-staged' : 'chip-modified' }
}

export function RepoDetail({ repo, onChanged }: { repo: RepoSummary; onChanged?: () => void }) {
  const { data, error, loading, reload } = useLoad(() => api.repo(repo.path), [repo.path])
  const [tab, setTab] = useState<Tab>('branches')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [newBranch, setNewBranch] = useState('')

  /** Chạy một hành động ghi, rồi tải lại chi tiết + danh sách repo. Trả về true nếu thành công. */
  const act = async (label: string, action: string, params: Record<string, unknown> = {}) => {
    setBusy(label); setNotice(null)
    try {
      const r = await api.action(repo.path, action, params)
      setNotice({ ok: true, text: r.output || 'Xong' })
      return true
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message })
      return false
    } finally {
      setBusy(null); reload(); onChanged?.()
    }
  }

  if (loading && !data) return <div className="detail"><Spinner label="Đang tải…" /></div>
  if (error && !data) return <div className="detail error-text">{error}</div>
  if (!data) return null

  const local = data.branches.filter((b) => !b.remote)
  const remote = data.branches.filter((b) => b.remote)
  const staged = data.files.filter(isStaged)
  const unstaged = data.files.filter(isUnstaged)
  const tabs: [Tab, string][] = [
    ['branches', `Nhánh (${local.length} local · ${remote.length} remote)`],
    ['changes', `Thay đổi (${data.files.length})`],
    ['commits', `Commit (${data.commits.length})`],
    ['remotes', `Remote (${data.remotes.length})`],
  ]

  return (
    <div className="detail">
      <div className="actions">
        <button disabled={!!busy || !data.remotes.length} onClick={() => act('fetch', 'fetch')}>{busy === 'fetch' ? 'Đang fetch…' : 'Fetch'}</button>
        <button disabled={!!busy || !data.upstream} title={data.upstream ? 'git pull --ff-only' : 'Nhánh chưa có upstream'} onClick={() => act('pull', 'pull')}>
          {busy === 'pull' ? 'Đang pull…' : 'Pull' + (data.behind ? ` ↓${data.behind}` : '')}
        </button>
        <button disabled={!!busy || data.detached || !data.remotes.length} onClick={() => act('push', 'push')}>
          {busy === 'push' ? 'Đang push…' : 'Push' + (data.ahead ? ` ↑${data.ahead}` : '')}
        </button>
      </div>
      {notice && <pre className={'notice ' + (notice.ok ? 'ok' : 'error-text')} role="status">{notice.text}</pre>}

      <div className="subtabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
        {data.stashes > 0 && <span className="muted stash">{data.stashes} stash</span>}
      </div>

      {tab === 'branches' && (
        <>
          <form className="actions" onSubmit={async (e) => { e.preventDefault(); if (newBranch.trim() && await act('create', 'createBranch', { name: newBranch.trim() })) setNewBranch('') }}>
            <input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="Tên nhánh mới (tạo từ HEAD và chuyển sang)" aria-label="Tên nhánh mới" />
            <button type="submit" disabled={!!busy || !newBranch.trim()}>Tạo nhánh</button>
          </form>
          <table className="inner">
            <thead><tr><th>Nhánh</th><th>Upstream</th><th>↑↓</th><th>Commit cuối</th><th>Khi nào</th><th></th></tr></thead>
            <tbody>
              {[...local, ...remote].map((b) => (
                <tr key={(b.remote ? 'r:' : 'l:') + b.name}>
                  <td>
                    {b.current && <span className="dot" title="Đang mở" />}
                    <span className={b.current ? 'cur' : ''}>{b.name}</span>
                    {b.remote && <span className="tag">remote</span>}
                  </td>
                  <td className="muted">{b.upstream ?? ''}{b.gone && ' (đã mất)'}</td>
                  <td>{b.ahead > 0 && <span className="ahead">↑{b.ahead}</span>} {b.behind > 0 && <span className="behind">↓{b.behind}</span>}</td>
                  <td className="subject" title={b.subject}>{b.sha} · {b.subject}</td>
                  <td className="muted">{relTime(b.date)}</td>
                  <td className="row-actions">
                    {!b.remote && b.upstream && !b.gone && b.behind > 0 && (
                      <button disabled={!!busy} title="Fast-forward từ upstream" onClick={() => act('pl:' + b.name, 'pullBranch', { branch: b.name })}>
                        {busy === 'pl:' + b.name ? '…' : 'Pull'}
                      </button>
                    )}
                    {!b.remote && data.remotes.length > 0 && (b.ahead > 0 || !b.upstream || b.gone) && (
                      <button disabled={!!busy} title={b.upstream && !b.gone ? 'Push lên upstream' : 'Push và đặt upstream'} onClick={() => act('ps:' + b.name, 'pushBranch', { branch: b.name })}>
                        {busy === 'ps:' + b.name ? '…' : 'Push'}
                      </button>
                    )}
                    {!b.current && (
                      <button disabled={!!busy} onClick={() => act('co:' + b.name, 'checkout', { branch: b.name, remote: b.remote })}>
                        {busy === 'co:' + b.name ? '…' : 'Chuyển'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!data.branches.length && <tr><td colSpan={6} className="muted">Chưa có nhánh nào (repo chưa có commit)</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'changes' && (
        <>
          <div className="actions">
            <button disabled={!!busy || !unstaged.length} onClick={() => act('stageAll', 'stage', { all: true })}>Stage tất cả</button>
            <button disabled={!!busy || !staged.length} onClick={() => act('unstageAll', 'unstage', { all: true })}>Unstage tất cả</button>
          </div>
          {data.files.length ? (
            <table className="inner">
              <thead><tr><th>Tệp</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {data.files.map((f) => {
                  const l = fileLabel(f)
                  return (
                    <tr key={f.path}>
                      <td className="mono">{f.path}</td>
                      <td><span className={'chip ' + l.cls}>{l.text}</span></td>
                      <td className="row-actions">
                        {isUnstaged(f) && <button disabled={!!busy} onClick={() => act('s:' + f.path, 'stage', { paths: [f.path] })}>Stage</button>}
                        {isStaged(f) && <button disabled={!!busy} onClick={() => act('u:' + f.path, 'unstage', { paths: [f.path] })}>Unstage</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="muted pad">Working tree sạch</div>}
          <form className="commit-box" onSubmit={async (e) => { e.preventDefault(); if (await act('commit', 'commit', { message, amend })) { setMessage(''); setAmend(false) } }}>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} aria-label="Nội dung commit"
              placeholder={amend ? 'Để trống để giữ nguyên nội dung commit cũ' : 'Nội dung commit'} />
            <div className="actions">
              <button type="submit" className="primary"
                disabled={!!busy || (amend ? !data.commits.length : !staged.length || !message.trim())}>
                {busy === 'commit' ? 'Đang commit…' : amend ? 'Amend commit' : `Commit (${staged.length} tệp)`}
              </button>
              <label className="muted"><input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> Amend commit cuối</label>
            </div>
          </form>
        </>
      )}

      {tab === 'commits' && (
        <table className="inner">
          <thead><tr><th>Hash</th><th>Nội dung</th><th>Tác giả</th><th>Khi nào</th></tr></thead>
          <tbody>
            {data.commits.map((c) => (
              <tr key={c.hash}><td className="mono">{c.hash}</td><td className="subject" title={c.subject}>{c.subject}</td><td className="muted">{c.author}</td><td className="muted">{relTime(c.date)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'remotes' && (
        data.remotes.length ? (
          <table className="inner">
            <thead><tr><th>Tên</th><th>URL</th></tr></thead>
            <tbody>{data.remotes.map((r) => <tr key={r.name}><td>{r.name}</td><td className="mono">{r.url}</td></tr>)}</tbody>
          </table>
        ) : <div className="muted pad">Chưa cấu hình remote</div>
      )}
    </div>
  )
}
