import { JiraChips } from './JiraChip'
import { useEffect, useState } from 'react'
import { api, useLoad } from '../api'
import { runAction } from '../lib/actions'
import { relTime } from '../lib/format'
import { bridge, copyText, MOD, revealLabel } from '../lib/platform'
import { pinRepo, toast, unpinRepo, useStore } from '../lib/store'
import type { FileChange, RepoSummary } from '../types'
import { RepoChanges } from './RepoChanges'
import { RepoScripts } from './RepoScripts'
import { RepoStash } from './RepoStash'
import { RepoWorktrees } from './RepoWorktrees'
import { Spinner, Icon } from './ui'
import { RepoJobs } from './JobDetail'
import { RepoMr } from './RepoMr'
import { ContextMenu } from './ContextMenu'
import { ShortNum } from './ShortNum'
import { useBranchTokens } from '../lib/useBranchTokens'
import { DeleteBranchDialog, DeleteRemoteBranchDialog, RenameBranchDialog } from './BranchDialogs'

type Tab = 'changes' | 'stash' | 'worktree' | 'branches' | 'commits' | 'remotes' | 'scripts'

const isStaged = (f: FileChange) => f.kind === 'change' && f.x !== '.'

type BranchDialog = { kind: 'delete' | 'rename' | 'deleteRemote'; name: string }

export function RepoDetail({ repo, tab, setTab, onClose, mode, onMode, onFocusCommit, onDelete }: { onDelete?: () => void; mode?: 'panel' | 'modal'; onMode?: (m: 'panel' | 'modal') => void; repo: RepoSummary; tab: Tab; setTab: (t: Tab) => void; onClose?: () => void; onFocusCommit?: (focus: () => void) => void }) {
  const rev = useStore((s) => s.rev)
  const isPinned = useStore((s) => s.pinned.includes(repo.path))
  const { data: raw, error, reload } = useLoad(() => api.repo(repo.path), [repo.path, rev], 0, 'repo:' + repo.path)
  // Server cũ (chưa khởi động lại sau khi nâng cấp) hoặc cache cũ có thể thiếu stashes / worktrees: coi như rỗng để UI không crash
  const tokens = useBranchTokens(repo.path)
  const data = raw && { ...raw, stashes: raw.stashes ?? [], worktrees: raw.worktrees ?? [] }
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [from, setFrom] = useState('')
  const [branchQ, setBranchQ] = useState('')
  const [dialog, setDialog] = useState<BranchDialog | null>(null)
  const [branchMenu, setBranchMenu] = useState<string | null>(null)
  useEffect(() => { setMessage(''); setAmend(false); setNewBranch(''); setFrom(''); setBranchQ(''); setDialog(null); setBranchMenu(null) }, [repo.path])

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
  const tabs: [Tab, string, number][] = [
    ['changes', 'Thay đổi', data.files.length], ['stash', 'Stash', data.stashes.length], ['worktree', 'Worktree', Math.max(0, data.worktrees.length - 1)], ['branches', 'Nhánh', data.branches.filter((x) => !x.remote).length],
    ['commits', 'Lịch sử', data.commits.length], ['remotes', 'Remote', data.remotes.length], ['scripts', 'Script', 0],
  ]
  const trackedDirty = data.files.some((f) => f.kind !== 'untracked')
  const bkey = (x: { remote: boolean; name: string }) => (x.remote ? 'r:' : 'l:') + x.name
  const localNames = data.branches.filter((x) => !x.remote).map((x) => x.name)
  const bq = branchQ.trim().toLowerCase()
  const shownBranches = [...data.branches.filter((x) => !x.remote), ...data.branches.filter((x) => x.remote)].filter((x) => !bq || x.name.toLowerCase().includes(bq))
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
          {onDelete && <button className={iconBtn + ' hover:!text-danger'} title="Xóa repo khỏi máy…" aria-label="Xóa repo khỏi máy" onClick={onDelete}><Icon name="trash" size={13} /></button>}
          {onMode && <button className={iconBtn} title={mode === 'modal' ? 'Chuyển sang khung bên phải' : 'Chuyển sang cửa sổ nổi'} aria-label={mode === 'modal' ? 'Chuyển sang khung bên phải' : 'Chuyển sang cửa sổ nổi'} onClick={() => onMode(mode === 'modal' ? 'panel' : 'modal')}><Icon name={mode === 'modal' ? 'panel' : 'modal'} size={13} /></button>}
          {onClose && <button className={iconBtn} title="Đóng chi tiết (Esc)" aria-label="Đóng chi tiết" onClick={onClose}><Icon name="x" size={13} /></button>}
        </div>

        <div className="flex items-center gap-2 font-mono text-[12px]">
          <button className="inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[5px] border border-accent/35 bg-accent/10 px-2 text-accent" title="Xem các nhánh" onClick={() => setTab('branches')}>
            <Icon name="git" size={12} />{data.branch ?? 'detached @ ' + data.head} ▾
          </button>
          <span className="truncate text-fg-mute">→ {data.upstream ?? 'chưa có upstream'}</span>
          <JiraChips texts={[data.branch]} />
        </div>

        {data.branch && tokens.get(data.branch) && (
          <div className="flex items-center gap-2 text-sm text-fg-mute" title={'Token AI của nhánh ' + data.branch + ' (Claude Code, Codex)'}>
            <Icon name="ai" size={12} />Token AI nhánh này: <span className="font-mono text-fg-soft"><ShortNum n={tokens.get(data.branch)!.today} /> hôm nay</span> · <span className="font-mono text-fg-soft"><ShortNum n={tokens.get(data.branch)!.total} /> tổng</span>
          </div>
        )}

        <RepoMr remotes={data.remotes.map((r) => r.url)} branch={data.branch} />
        <RepoJobs repoPath={data.path} />

        <div className="flex gap-1.5">
          <button className="btn flex-1" disabled={!!busy || !data.remotes.length} onClick={() => act('fetch', 'fetch')}>{busy === 'fetch' ? <><Spinner inline />Đang fetch…</> : 'Fetch'}</button>
          <button className="btn flex-1" disabled={!!busy || !data.upstream} title={data.upstream ? 'git pull --ff-only' : 'Nhánh chưa có upstream'} onClick={() => act('pull', 'pull')}>
            {busy === 'pull' ? <><Spinner inline />Đang pull…</> : <>Pull {data.behind > 0 && <span className="font-mono text-behind">↓{data.behind}</span>}</>}
          </button>
          <button className="btn primary flex-1" disabled={!!busy || data.detached || !data.remotes.length} onClick={() => act('push', 'push')}>
            {busy === 'push' ? <><Spinner inline />Đang push…</> : <>Push {data.ahead > 0 && <span className="font-mono">↑{data.ahead}</span>}</>}
          </button>
        </div>
      </div>

      <div role="tablist" className="flex flex-none gap-0.5 border-b border-border px-2.5">
        {tabs.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id}
            className={'h-9 cursor-pointer border-0 border-b-2 bg-transparent px-2 text-[12px] font-medium whitespace-nowrap ' + (tab === id ? 'border-accent text-fg' : 'border-transparent text-fg-mute hover:text-fg')}
            onClick={() => setTab(id)}>{label}{id !== 'scripts' && <span className="font-mono text-fg-mute"> {n}</span>}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'changes' && <RepoChanges data={data} busy={busy} act={act} />}

        {tab === 'scripts' && <RepoScripts repoPath={repo.path} />}

        {tab === 'stash' && <RepoStash data={data} busy={busy} act={act} />}

        {tab === 'worktree' && <RepoWorktrees data={data} busy={busy} act={act} />}

        {tab === 'branches' && (
          <div className="flex flex-col">
            <form className="flex gap-1.5 px-4 py-2.5" onSubmit={async (e) => { e.preventDefault(); if (newBranch.trim() && await act('create', 'createBranch', { name: newBranch.trim(), from: from || undefined })) { setNewBranch(''); setFrom('') } }}>
              <input className="min-w-0 flex-1 font-mono" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="Tên nhánh mới" aria-label="Tên nhánh mới" />
              <input className="max-w-[40%] min-w-0 flex-1 font-mono" list="branch-from-options" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Từ HEAD (gõ để tìm nhánh)" aria-label="Tạo từ" title="Điểm bắt đầu của nhánh mới: gõ để tìm nhánh, để trống = HEAD" spellCheck={false} />
              <datalist id="branch-from-options">
                {data.branches.map((x) => <option key={(x.remote ? 'r:' : 'l:') + x.name} value={x.name}>{x.remote ? 'remote' : 'local'}</option>)}
              </datalist>
              <button type="submit" className="btn" disabled={!!busy || !newBranch.trim()}>Tạo nhánh</button>
            </form>
            <div className="px-4 pb-2">
              <input type="search" className="w-full font-mono" value={branchQ} onChange={(e) => setBranchQ(e.target.value)} placeholder="Lọc nhánh…" aria-label="Lọc nhánh" spellCheck={false} />
            </div>
            {shownBranches.map((x) => (
              <div key={(x.remote ? 'r:' : 'l:') + x.name} className="flex items-center gap-2 border-t border-line px-4 py-[7px] hover:bg-selected">
                <span className={'size-1.5 flex-none rounded-full ' + (x.current ? 'bg-accent' : 'bg-transparent')} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={'truncate font-mono text-[12px] ' + (x.current ? 'text-fg' : x.remote ? 'text-fg-mute' : 'text-fg-soft')}>{x.name}</span>
                  <span className="truncate text-sm text-fg-mute" title={x.subject}>
                    {x.current ? 'đang mở' : x.remote ? 'remote' : x.upstream && !x.gone ? x.upstream : x.gone ? 'upstream đã mất' : 'chưa có upstream'} · {relTime(x.date)}
                  </span>
                </span>
                {!x.remote && tokens.get(x.name) && <span className="font-mono text-sm text-fg-mute" title="Token AI của nhánh này (tổng)"><ShortNum n={tokens.get(x.name)!.total} /></span>}
                <span className="font-mono text-sm">{x.ahead > 0 && <span className="text-ahead">↑{x.ahead}</span>} {x.behind > 0 && <span className="text-behind">↓{x.behind}</span>}</span>
                {!x.remote && x.upstream && !x.gone && x.behind > 0 && <button className="btn sm" disabled={!!busy} title="Fast-forward từ upstream" onClick={() => act('pl:' + x.name, 'pullBranch', { branch: x.name })}>Pull</button>}
                {!x.remote && data.remotes.length > 0 && (x.ahead > 0 || !x.upstream || x.gone) && <button className="btn sm" disabled={!!busy} title={x.upstream && !x.gone ? 'Push lên upstream' : 'Push và đặt upstream'} onClick={() => act('ps:' + x.name, 'pushBranch', { branch: x.name })}>Push</button>}
                {!x.current && <button className="btn sm" disabled={!!busy} title={trackedDirty ? 'Còn thay đổi chưa commit: cất vào stash rồi chuyển nhánh (lấy lại ở tab Stash)' : undefined} onClick={() => act('co:' + x.name, 'checkout', { branch: x.name, remote: x.remote, stash: trackedDirty })}>{trackedDirty ? 'Stash rồi chuyển' : 'Chuyển'}</button>}
                {(!x.current) && (
                  <span className="relative">
                    <button className="ghost flex size-6 items-center justify-center" aria-label={'Thao tác cho nhánh ' + x.name} aria-haspopup="menu" aria-expanded={branchMenu === bkey(x)} onClick={() => setBranchMenu(branchMenu === bkey(x) ? null : bkey(x))}><Icon name="dots" size={13} /></button>
                    {branchMenu === bkey(x) && <ContextMenu label={'Thao tác cho nhánh ' + x.name} onClose={() => setBranchMenu(null)} items={x.remote
                      ? [{ label: 'Xóa trên remote…', danger: true, run: () => setDialog({ kind: 'deleteRemote', name: x.name }) }]
                      : [{ label: 'Đổi tên…', run: () => setDialog({ kind: 'rename', name: x.name }) }, { sep: true }, { label: 'Xóa nhánh…', danger: true, run: () => setDialog({ kind: 'delete', name: x.name }) }]} />}
                  </span>
                )}
                {x.current && !x.remote && <button className="ghost flex size-6 items-center justify-center" aria-label={'Đổi tên nhánh ' + x.name} title="Đổi tên nhánh đang mở" onClick={() => setDialog({ kind: 'rename', name: x.name })}><Icon name="dots" size={13} /></button>}
              </div>
            ))}
            {!data.branches.length && <p className="empty">Chưa có nhánh nào (repo chưa có commit)</p>}
            {!!data.branches.length && !shownBranches.length && <p className="empty">Không có nhánh khớp “{branchQ}”</p>}
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
              {busy === 'commit' ? <><Spinner inline />Đang commit…</> : amend ? 'Amend commit' : `Commit ${staged.length} tệp`}
            </button>
          </div>
        </form>
      )}
      {dialog?.kind === 'delete' && <DeleteBranchDialog repoPath={repo.path} repoName={repo.name} branch={dialog.name} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'deleteRemote' && <DeleteRemoteBranchDialog repoPath={repo.path} repoName={repo.name} refName={dialog.name} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rename' && <RenameBranchDialog repoPath={repo.path} repoName={repo.name} branch={dialog.name} existing={localNames} onClose={() => setDialog(null)} />}
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
