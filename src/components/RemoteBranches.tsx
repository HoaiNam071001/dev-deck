import { useMemo, useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import { usePersisted } from '../lib/persist'
import { copyText } from '../lib/platform'
import type { ProjectEntry } from '../lib/remoteGroups'
import { toast } from '../lib/store'
import type { RemoteAccount, RemoteBranch } from '../types'
import { CR_WORD, crRef, safeUrl } from './RemoteBits'
import { RemoteDetailModal } from './RemoteDetail'
import { Chip, Icon, Spinner } from './ui'

const fullPath = (p: ProjectEntry) => (p.parent ? `${p.parent}/${p.name}` : p.name)
const PATH_RE = /^[\w.-]+(\/[\w.-]+)+$/

function BranchChips({ b }: { b: RemoteBranch }) {
  return <>{b.isDefault && <Chip tone="info">Mặc định</Chip>}{b.protected && <Chip tone="muted" title="Nhánh được bảo vệ">Bảo vệ</Chip>}</>
}

/** Nhánh trên remote của một project, đối chiếu MR / PR và bản clone local; gợi ý nhánh đã merge để dọn (chỉ chép lệnh, không tự xóa). */
export function RemoteBranches({ projects, accounts }: { projects: ProjectEntry[]; accounts: RemoteAccount[] }) {
  // Lựa chọn lưu dạng "accountId|group/project"; project gõ tay cũng nằm trong cùng dạng này
  const [sel, setSel] = usePersisted<string>('remotes.branchProject', '', (v) => typeof v === 'string')
  const [custom, setCustom] = useState('')
  const options = useMemo(() => projects.map((p) => ({ value: `${p.accountId}|${fullPath(p)}`, label: fullPath(p) })), [projects])
  const all = !sel || options.some((o) => o.value === sel) ? options : [{ value: sel, label: sel.slice(sel.indexOf('|') + 1) }, ...options]
  const cur = all.find((o) => o.value === sel) ?? all[0]
  const accountId = cur ? cur.value.slice(0, cur.value.indexOf('|')) : ''
  const project = cur ? cur.value.slice(cur.value.indexOf('|') + 1) : ''
  const data = useLoad(() => (cur ? api.remoteBranches(accountId, project) : Promise.resolve(null)), [cur?.value])
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const addCustom = () => {
    const p = custom.trim().replace(/^\/+|\/+$/g, '')
    const acc = accounts.find((a) => a.id === accountId) ?? accounts[0]
    if (!PATH_RE.test(p) || !acc) { toast({ kind: 'err', title: 'Đường dẫn project không hợp lệ', detail: 'Dạng group/project (GitLab) hoặc owner/repo (GitHub).' }); return }
    setSel(`${acc.id}|${p}`); setCustom('')
  }

  const d = data.data
  const rows = useMemo(() => {
    if (!d) return []
    const byBranch = new Map<string, typeof d.crs>()
    for (const c of d.crs) byBranch.set(c.source, [...(byBranch.get(c.source) ?? []), c])
    const local = new Set(d.local?.branches ?? [])
    return d.branches.map((b) => {
      const mrs = [...(byBranch.get(b.name) ?? [])].sort((x, y) => (x.state === 'opened' ? 0 : 1) - (y.state === 'opened' ? 0 : 1) || y.updatedAt.localeCompare(x.updatedAt))
      const mr = mrs[0]
      const hasOpen = mrs.some((m) => m.state === 'opened')
      const merged = b.merged === true || (!!mr && mr.state === 'merged')
      return { b, mr, stale: !b.isDefault && !b.protected && merged && !hasOpen, hasLocal: local.has(b.name) }
    }).sort((x, y) => Number(y.b.isDefault) - Number(x.b.isDefault) || Number(y.mr?.state === 'opened') - Number(x.mr?.state === 'opened') || (y.b.commit?.date ?? '').localeCompare(x.b.commit?.date ?? ''))
  }, [d])
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => !needle || r.b.name.toLowerCase().includes(needle))
  const stale = rows.filter((r) => r.stale)
  const picked = open ? d?.crs.find((c) => c.key === open) : undefined
  const copyClean = async () => {
    const cmd = stale.map((r) => `git push origin --delete ${r.b.name}`).join('\n')
    toast(await copyText(cmd) ? { kind: 'ok', title: `Đã chép lệnh xóa ${stale.length} nhánh remote`, detail: 'Xem lại danh sách trước khi dán vào terminal.' } : { kind: 'err', title: 'Không chép được' })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-fg-mute" htmlFor="br-proj">Project</label>
        <select id="br-proj" className="min-w-[240px]" value={cur?.value ?? ''} onChange={(e) => setSel(e.target.value)}>
          {all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input className="!h-[30px] min-w-[200px]" placeholder="Hoặc gõ group/project rồi Enter" aria-label="Thêm project" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustom() }} />
        <input type="search" className="!h-[30px] min-w-[160px]" placeholder="Lọc nhánh…" aria-label="Lọc nhánh" value={q} onChange={(e) => setQ(e.target.value)} />
        {safeUrl(d?.url) && <a className="btn sm" href={safeUrl(d?.url)} target="_blank" rel="noopener noreferrer">Mở project</a>}
        {stale.length > 0 && <button className="btn sm ml-auto" onClick={() => void copyClean()}><Icon name="copy" size={12} />Chép lệnh dọn {stale.length} nhánh đã merge</button>}
      </div>

      {!cur && <div className="banner">Chưa có project nào. Gõ <span className="mono">group/project</span> ở ô trên để xem nhánh.</div>}
      {data.error && <div className="banner err" role="alert">Không tải được nhánh: {data.error}</div>}
      {d?.crsError && <div className="banner">Không lấy được MR / PR của project này, chỉ hiện nhánh.</div>}
      {data.loading && <Spinner label="Đang lấy nhánh từ remote…" />}

      {d && (
        <div className="text-[12px] text-fg-mute">
          {d.branches.length} nhánh{d.branches.length >= 100 ? ' (100 mới nhất)' : ''}
          {d.local ? <> · clone local: <span className="mono text-fg-soft" title={d.local.path}>{d.local.name}</span></> : ' · chưa có clone local trong thư mục đã quét'}
        </div>
      )}

      {d && shown.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-border bg-surface" role="list" aria-label="Nhánh trên remote">
          {shown.map(({ b, mr, stale: st, hasLocal }) => (
            <div role="listitem" key={b.name} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="mono truncate text-[13px] font-semibold" title={b.name}>{b.name}</span>
                  <BranchChips b={b} />
                  {st && <Chip tone="behind" title="Đã merge và không còn MR / PR đang mở">Nên dọn</Chip>}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-fg-mute" title={b.commit?.title}>
                  {b.commit ? <>{b.commit.title} · {b.commit.author} · {relTime(b.commit.date)}</> : 'Không có commit'}
                </div>
              </div>
              <div className="flex flex-none items-center gap-1.5 text-[12px] whitespace-nowrap max-md:hidden">
                {d.local && (hasLocal ? <Chip tone="ok" title="Có nhánh cùng tên ở bản clone local">Có ở local</Chip> : <Chip tone="muted" title="Bản clone local chưa có nhánh này">Chưa có ở local</Chip>)}
              </div>
              <div className="flex w-[190px] flex-none justify-end max-md:w-auto">
                {mr ? (
                  <button className="btn sm" onClick={() => setOpen(mr.key)} title={mr.title}>
                    {CR_WORD[mr.provider]} {crRef(mr)}{mr.state === 'merged' ? ' · merged' : mr.state === 'closed' ? ' · closed' : ''}
                  </button>
                ) : <span className="text-[12px] text-fg-mute">{b.isDefault ? '' : 'Chưa có MR / PR'}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {d && !shown.length && <div className="banner">{needle ? 'Không có nhánh nào khớp.' : 'Project chưa có nhánh nào.'}</div>}
      {picked && <RemoteDetailModal key={picked.key} cr={picked} onClose={() => setOpen(null)} />}
    </div>
  )
}
