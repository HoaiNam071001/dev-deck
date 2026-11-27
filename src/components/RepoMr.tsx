import { useState } from 'react'
import { api, useLoad } from '../api'
import { RemoteDetailModal } from './RemoteDetail'
import { ApprovalChip, CiChip, CR_WORD, crRef, ThreadChip } from './RemoteBits'
import { Chip } from './ui'

/** MR / PR của nhánh hiện tại, tìm qua URL remote khớp với account ở tab Remotes. Không có account khớp thì không hiện gì. */
export function RepoMr({ remotes, branch }: { remotes: string[]; branch: string | null }) {
  const { data } = useLoad(() => (branch && remotes.length ? api.branchChangeRequests(remotes, branch) : Promise.resolve([])), [remotes.join('\n'), branch], 120000, 'repoMr:' + remotes.join(',') + '#' + branch)
  const [open, setOpen] = useState<string | null>(null)
  if (!data?.length) return null
  const picked = data.find((c) => c.key === open)
  return (
    <div className="flex flex-col gap-1">
      {data.map((c) => (
        <button key={c.key} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[6px] border border-border bg-surface px-2 py-1.5 text-left hover:bg-selected" onClick={() => setOpen(c.key)} title={c.title}>
          <span className="font-mono text-[12px] text-ahead">{CR_WORD[c.provider]} {crRef(c)}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px]">{c.title}</span>
          {c.state !== 'opened' && <Chip tone={c.state === 'merged' ? 'ok' : 'muted'}>{c.state === 'merged' ? 'Đã merge' : 'Đã đóng'}</Chip>}
          {c.state === 'opened' && <><CiChip ci={c.ci} /><ApprovalChip a={c.approvals} /><ThreadChip t={c.threads} /></>}
        </button>
      ))}
      {picked && <RemoteDetailModal key={picked.key} cr={picked} onClose={() => setOpen(null)} />}
    </div>
  )
}
