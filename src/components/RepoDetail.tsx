import { useEffect, useState } from 'react'
import { api, useLoad } from '../api'
import { runAction } from '../lib/actions'
import { relTime } from '../lib/format'
import { bridge, copyText, MOD, revealLabel } from '../lib/platform'
import { pinRepo, toast, unpinRepo, useStore } from '../lib/store'
import type { FileChange, RepoSummary } from '../types'
import { Spinner, Icon } from './ui'
import { RepoJobs } from './JobDetail'

type Tab = 'changes' | 'branches' | 'commits' | 'remotes'

const isStaged = (f: FileChange) => f.kind === 'change' && f.x !== '.'
const isUnstaged = (f: FileChange) => f.kind !== 'change' || f.y !== '.'

const LETTER: Record<string, string> = {
  M: 'bg-behind/15 text-behind', A: 'bg-accent/15 text-accent', D: 'bg-danger/15 text-danger',
  R: 'bg-ahead/15 text-ahead', C: 'bg-ahead/15 text-ahead', U: 'bg-danger/15 text-danger', '?': 'bg-border text-untracked',
}

function FileRow({ f, staged, add, del, busy, onToggle }: { f: FileChange; staged: boolean; add?: number; del?: number; busy: boolean; onToggle: () => void }) {
  const letter = staged ? f.x : f.kind === 'untracked' ? '?' : f.kind === 'conflict' ? 'U' : f.y
  const i = f.path.lastIndexOf('/')
  return (
    <label className="flex cursor-default items-center gap-2 px-4 py-1 font-mono text-[12px] hover:bg-selected">
      <input type="checkbox" checked={staged} disabled={busy} onChange={onToggle} aria-label={(staged ? 'Bỏ stage ' : 'Stage ') + f.path} />
      <span className={'flex size-4 flex-none items-center justify-center rounded-[3px] text-[10px] font-semibold ' + (LETTER[letter] ?? LETTER['?'])}>{letter}</span>
      <span className="min-w-0 flex-1 truncate" title={f.path}><span className="text-fg-mute">{f.path.slice(0, i + 1)}</span>{f.path.slice(i + 1)}</span>
      <span className="text-[10px]">
        {!!add && <span className="text-accent">+{add}</span>} {!!del && <span className="text-danger">−{del}</span>}
      </span>
    </label>
  )
}

const SectionHead = ({ title, action }: { title: string; action: React.ReactNode }) => (
  <div className="flex items-center justify-between px-4 pt-2 pb-0.5">
    <span className="text-[10px] font-semibold tracking-[.08em] text-fg-mute uppercase">{title}</span>{action}
  </div>
)

export function RepoDetail({ repo, tab, setTab, onClose, mode, onMode, onFocusCommit }: { mode?: 'panel' | 'modal'; onMode?: (m: 'panel' | 'modal') => void; repo: RepoSummary; tab: Tab; setTab: (t: Tab) => void; onClose?: () => void; onFocusCommit?: (focus: () => void) => void }) {
  const rev = useStore((s) => s.rev)
  const isPinned = useStore((s) => s.pinned.includes(repo.path))
  const { data, error, reload } = useLoad(() => api.repo(repo.path), [repo.path, rev])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  useEffect(() => { setMessage(''); setAmend(false); setNewBranch('') }, [repo.path])

  const act = async (label: string, action: string, params: Record<string, unknown> = {}, quiet = false) => {
    setBusy(label)
    try { return await runAction(repo.path, repo.name, action, params, quiet) } finally { setBusy(null) }
  }

  if ((error && !data) || repo.error) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5">
          <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold">{repo.name}</h2>
          {onClose && <button className="icon-btn sm" title="Đóng chi tiết (Esc)" aria-label="Đóng chi tiết" onClick={onClose}><Icon name="x" size={13} /></button>}
        </div>
        <span className="truncate font-mono text-sm text-fg-mute" title={repo.path}>{repo.path}</span>
        <p className="text-danger">{repo.error ?? error}</p>
      </div>
    )
  }
  if (!data || data.path !== repo.path) return <Spinner label="Đang tải…" />

  const b = bridge()
  const staged = data.files.filter(isStaged)
  const unstaged = data.files.filter(isUnstaged)
  const tabs: [Tab, string, number][] = [
    ['changes', 'Thay đổi', data.files.length], ['branches', 'Nhánh', data.branches.filter((x) => !x.remote).length],
    ['commits', 'Lịch sử', data.commits.length], ['remotes', 'Remote', data.remotes.length],
  ]
  const canCommit = !busy && (amend ? !!data.commits.length : !!staged.length && !!message.trim())
  const commit = async () => { if (canCommit && await act('commit', 'commit', { message, amend })) { setMessage(''); setAmend(false) } }
  const iconBtn = 'icon-btn sm'

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-border px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="truncate text-[16px] font-semibold tracking-tight">{data.name}</h2>
            <span className="truncate font-mono text-sm text-fg-mute" title={data.path}>{data.path}</span>
          </div>
          {b?.openVSCode && <button className={iconBtn} title="Mở trong VS Code" aria-label="Mở trong VS Code" onClick={() => b.openVSCode!(data.path)}><Icon name="code" size={13} /></button>}
          {b?.openTerminal && <button className={iconBtn} title="Mở Terminal" aria-label="Mở Terminal" onClick={() => b.openTerminal!(data.path)}><Icon name="terminal" size={13} /></button>}
          {b?.reveal && <button className={iconBtn} title={revealLabel} aria-label={revealLabel} onClick={() => b.reveal!(data.path)}><Icon name="folder" size={13} /></button>}
          <button className={iconBtn} title="Sao chép đường dẫn" aria-label="Sao chép đường dẫn" onClick={async () => toast(await copyText(data.path) ? { kind: 'ok', title: 'Đã sao chép đường dẫn' } : { kind: 'err', title: 'Không sao chép được' })}><Icon name="copy" size={13} /></button>
          <button className={iconBtn + (isPinned ? ' !text-accent' : '')} title={isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'} aria-label={isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'} aria-pressed={isPinned} onClick={() => (isPinned ? unpinRepo(data.path) : pinRepo(data.path))}><Icon name="pin" size={13} fill={isPinned} /></button>
          {onMode && <button className={iconBtn} title={mode === 'modal' ? 'Chuyển sang khung bên phải' : 'Chuyển sang cửa sổ nổi'} aria-label={mode === 'modal' ? 'Chuyển sang khung bên phải' : 'Chuyển sang cửa sổ nổi'} onClick={() => onMode(mode === 'modal' ? 'panel' : 'modal')}><Icon name={mode === 'modal' ? 'panel' : 'modal'} size={13} /></button>}
          {onClose && <button className={iconBtn} title="Đóng chi tiết (Esc)" aria-label="Đóng chi tiết" onClick={onClose}><Icon name="x" size={13} /></button>}
        </div>

        <div className="flex items-center gap-2 font-mono text-[12px]">
          <button className="inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[5px] border border-accent/35 bg-accent/10 px-2 text-accent" title="Xem các nhánh" onClick={() => setTab('branches')}>
            <Icon name="git" size={12} />{data.branch ?? 'detached @ ' + data.head} ▾
          </button>
          <span className="truncate text-fg-mute">→ {data.upstream ?? 'chưa có upstream'}</span>
        </div>

        <RepoJobs repoPath={data.path} />

        <div className="flex gap-1.5">
          <button className="btn flex-1" disabled={!!busy || !data.remotes.length} onClick={() => act('fetch', 'fetch')}>{busy === 'fetch' ? 'Đang fetch…' : 'Fetch'}</button>
          <button className="btn flex-1" disabled={!!busy || !data.upstream} title={data.upstream ? 'git pull --ff-only' : 'Nhánh chưa có upstream'} onClick={() => act('pull', 'pull')}>
            {busy === 'pull' ? 'Đang pull…' : <>Pull {data.behind > 0 && <span className="font-mono text-behind">↓{data.behind}</span>}</>}
          </button>
          <button className="btn primary flex-1" disabled={!!busy || data.detached || !data.remotes.length} onClick={() => act('push', 'push')}>
            {busy === 'push' ? 'Đang push…' : <>Push {data.ahead > 0 && <span className="font-mono">↑{data.ahead}</span>}</>}
          </button>
        </div>
      </div>

      <div role="tablist" className="flex flex-none gap-0.5 border-b border-border px-2.5">
        {tabs.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id}
            className={'h-9 cursor-pointer border-0 border-b-2 bg-transparent px-2 text-[12px] font-medium whitespace-nowrap ' + (tab === id ? 'border-accent text-fg' : 'border-transparent text-fg-mute hover:text-fg')}
            onClick={() => setTab(id)}>{label} <span className="font-mono text-fg-mute">{n}</span></button>
        ))}
        {data.stashes > 0 && <span className="ml-auto self-center pr-2 text-sm text-fg-mute">{data.stashes} stash</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'changes' && (data.files.length ? (
          <div className="pb-1.5">
            <SectionHead title={`Đã stage · ${staged.length}`} action={<button className="ghost h-6 text-sm disabled:opacity-40" disabled={!!busy || !staged.length} onClick={() => act('unstageAll', 'unstage', { all: true }, true)}>Bỏ stage tất cả</button>} />
            {staged.map((f) => <FileRow key={'s' + f.path} f={f} staged add={data.numstat?.staged[f.path]?.[0]} del={data.numstat?.staged[f.path]?.[1]} busy={!!busy} onToggle={() => act('u:' + f.path, 'unstage', { paths: [f.path] }, true)} />)}
            {!staged.length && <p className="px-4 py-1 text-sm text-fg-mute">Chưa có tệp nào được stage</p>}
            <SectionHead title={`Chưa stage · ${unstaged.length}`} action={<button className="ghost h-6 text-sm !text-accent disabled:opacity-40" disabled={!!busy || !unstaged.length} onClick={() => act('stageAll', 'stage', { all: true }, true)}>Stage tất cả</button>} />
            {unstaged.map((f) => <FileRow key={'u' + f.path} f={f} staged={false} add={data.numstat?.unstaged[f.path]?.[0]} del={data.numstat?.unstaged[f.path]?.[1]} busy={!!busy} onToggle={() => act('s:' + f.path, 'stage', { paths: [f.path] }, true)} />)}
          </div>
        ) : <p className="empty">Working tree sạch</p>)}

        {tab === 'branches' && (
          <div className="flex flex-col">
            <form className="flex gap-1.5 px-4 py-2.5" onSubmit={async (e) => { e.preventDefault(); if (newBranch.trim() && await act('create', 'createBranch', { name: newBranch.trim() })) setNewBranch('') }}>
              <input className="min-w-0 flex-1 font-mono" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="Tên nhánh mới từ HEAD" aria-label="Tên nhánh mới" />
              <button type="submit" className="btn" disabled={!!busy || !newBranch.trim()}>Tạo nhánh</button>
            </form>
            {[...data.branches.filter((x) => !x.remote), ...data.branches.filter((x) => x.remote)].map((x) => (
              <div key={(x.remote ? 'r:' : 'l:') + x.name} className="flex items-center gap-2 border-t border-line px-4 py-[7px] hover:bg-selected">
                <span className={'size-1.5 flex-none rounded-full ' + (x.current ? 'bg-accent' : 'bg-transparent')} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={'truncate font-mono text-[12px] ' + (x.current ? 'text-fg' : x.remote ? 'text-fg-mute' : 'text-fg-soft')}>{x.name}</span>
                  <span className="truncate text-sm text-fg-mute" title={x.subject}>
                    {x.current ? 'đang mở' : x.remote ? 'remote' : x.upstream && !x.gone ? x.upstream : x.gone ? 'upstream đã mất' : 'chưa có upstream'} · {relTime(x.date)}
                  </span>
                </span>
                <span className="font-mono text-sm">{x.ahead > 0 && <span className="text-ahead">↑{x.ahead}</span>} {x.behind > 0 && <span className="text-behind">↓{x.behind}</span>}</span>
                {!x.remote && x.upstream && !x.gone && x.behind > 0 && <button className="btn sm" disabled={!!busy} title="Fast-forward từ upstream" onClick={() => act('pl:' + x.name, 'pullBranch', { branch: x.name })}>Pull</button>}
                {!x.remote && data.remotes.length > 0 && (x.ahead > 0 || !x.upstream || x.gone) && <button className="btn sm" disabled={!!busy} title={x.upstream && !x.gone ? 'Push lên upstream' : 'Push và đặt upstream'} onClick={() => act('ps:' + x.name, 'pushBranch', { branch: x.name })}>Push</button>}
                {!x.current && <button className="btn sm" disabled={!!busy} onClick={() => act('co:' + x.name, 'checkout', { branch: x.name, remote: x.remote })}>Chuyển</button>}
              </div>
            ))}
            {!data.branches.length && <p className="empty">Chưa có nhánh nào (repo chưa có commit)</p>}
          </div>
        )}

        {tab === 'commits' && (
          <div className="flex flex-col py-1.5">
            {data.commits.map((c) => (
              <div key={c.hash} className="grid grid-cols-[62px_1fr_auto] items-center gap-2.5 px-4 py-1.5 text-[12px] hover:bg-selected">
                <span className="font-mono text-accent">{c.hash}</span>
                <span className="truncate" title={c.subject}>{c.subject}</span>
                <span className="text-sm whitespace-nowrap text-fg-mute" title={c.author}>{relTime(c.date)}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'remotes' && (data.remotes.length
          ? <div className="grid grid-cols-[62px_1fr] gap-2.5 px-4 py-3 font-mono text-[12px]">
              {data.remotes.map((r) => <div key={r.name} className="contents"><span>{r.name}</span><span className="break-all text-fg-mute">{r.url}</span></div>)}
            </div>
          : <p className="empty">Chưa cấu hình remote</p>)}
      </div>

      {tab === 'changes' && (
        <form className="flex flex-none flex-col gap-2 border-t border-border bg-[#17191B] px-4 pt-2.5 pb-3" onSubmit={(e) => { e.preventDefault(); void commit() }}>
          <label className="sr-only" htmlFor="commit-msg">Nội dung commit</label>
          <CommitBox id="commit-msg" value={message} onChange={setMessage} onSubmit={commit} amend={amend} register={onFocusCommit} />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-sm text-fg-mute"><input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> Amend commit cuối</label>
            <button type="submit" className="btn primary" disabled={!canCommit}>
              {busy === 'commit' ? 'Đang commit…' : amend ? 'Amend commit' : `Commit ${staged.length} tệp`}
            </button>
          </div>
        </form>
      )}
      {/* tải lại thủ công khi cần (ví dụ sau thay đổi ngoài app) */}
      <button className="sr-only" onClick={reload}>Tải lại chi tiết</button>
    </>
  )
}

function CommitBox({ id, value, onChange, onSubmit, amend, register }: { id: string; value: string; onChange: (v: string) => void; onSubmit: () => void; amend: boolean; register?: (focus: () => void) => void }) {
  return (
    <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)}
      ref={(el) => { if (el && register) register(() => el.focus()) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit() } }}
      placeholder={amend ? 'Để trống để giữ nguyên nội dung commit cũ' : `Nội dung commit (${MOD}Enter để commit)`}
      className="block w-full" />
  )
}
