import { useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import type { FileChange, RepoSummary } from '../types'

type Tab = 'branches' | 'changes' | 'commits' | 'remotes'

function fileLabel(f: FileChange): { text: string; cls: string } {
  if (f.kind === 'untracked') return { text: 'chưa theo dõi', cls: 'chip-untracked' }
  if (f.kind === 'conflict') return { text: 'xung đột', cls: 'chip-conflict' }
  const parts: string[] = []
  if (f.x !== '.') parts.push('staged')
  if (f.y !== '.') parts.push('sửa')
  return { text: parts.join(' + '), cls: f.x !== '.' && f.y === '.' ? 'chip-staged' : 'chip-modified' }
}

export function RepoDetail({ repo }: { repo: RepoSummary }) {
  const { data, error, loading } = useLoad(() => api.repo(repo.path), [repo.path])
  const [tab, setTab] = useState<Tab>('branches')

  if (loading && !data) return <div className="detail muted">Đang tải…</div>
  if (error) return <div className="detail error-text">{error}</div>
  if (!data) return null

  const local = data.branches.filter((b) => !b.remote)
  const remote = data.branches.filter((b) => b.remote)
  const tabs: [Tab, string][] = [
    ['branches', `Nhánh (${local.length} local · ${remote.length} remote)`],
    ['changes', `Thay đổi (${data.files.length})`],
    ['commits', `Commit (${data.commits.length})`],
    ['remotes', `Remote (${data.remotes.length})`],
  ]

  return (
    <div className="detail">
      <div className="subtabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
        {data.stashes > 0 && <span className="muted stash">{data.stashes} stash</span>}
      </div>

      {tab === 'branches' && (
        <table className="inner">
          <thead><tr><th>Nhánh</th><th>Upstream</th><th>↑↓</th><th>Commit cuối</th><th>Khi nào</th></tr></thead>
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
              </tr>
            ))}
            {!data.branches.length && <tr><td colSpan={5} className="muted">Chưa có nhánh nào (repo chưa có commit)</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'changes' && (
        data.files.length ? (
          <table className="inner">
            <thead><tr><th>Tệp</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {data.files.map((f) => {
                const l = fileLabel(f)
                return <tr key={f.path}><td className="mono">{f.path}</td><td><span className={'chip ' + l.cls}>{l.text}</span></td></tr>
              })}
            </tbody>
          </table>
        ) : <div className="muted pad">Working tree sạch</div>
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
