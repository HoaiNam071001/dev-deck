import { useMemo, useState } from 'react'
import { api, useLoad } from '../api'
import { relTime } from '../lib/format'
import { usePersisted } from '../lib/persist'
import type { ProjectEntry } from '../lib/remoteGroups'
import type { CiState, PipelineJob, PipelineRun, RemoteAccount } from '../types'
import { ciTone, safeUrl } from './RemoteBits'
import { Chip, Spinner } from './ui'

const fullPath = (p: ProjectEntry) => (p.parent ? `${p.parent}/${p.name}` : p.name)
const LABEL: Record<CiState, string> = { success: 'Pass', failed: 'Lỗi', running: 'Đang chạy', pending: 'Chờ', canceled: 'Hủy', none: 'Bỏ qua' }

export const fmtDur = (s: number | null) => (s === null ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`)
const StatusChip = ({ s }: { s: CiState }) => <Chip tone={ciTone(s)}>{LABEL[s]}</Chip>

/** Job của một pipeline, nhóm theo stage; job lỗi kèm đoạn cuối log (GitLab). */
function Jobs({ accountId, project, run }: { accountId: string; project: string; run: PipelineRun }) {
  const jobs = useLoad(() => api.pipelineJobs(accountId, project, run.id), [accountId, project, run.id], run.status === 'running' || run.status === 'pending' ? 15000 : 0)
  const stages = useMemo(() => {
    const m = new Map<string, PipelineJob[]>()
    for (const j of jobs.data ?? []) m.set(j.stage, [...(m.get(j.stage) ?? []), j])
    return [...m]
  }, [jobs.data])
  if (jobs.error) return <div className="banner err m-3" role="alert">Không tải được job: {jobs.error}</div>
  if (!jobs.data) return <div className="p-3"><Spinner label="Đang lấy job…" /></div>
  if (!stages.length) return <div className="p-3 text-[12px] text-fg-mute">Pipeline chưa có job nào.</div>
  return (
    <div className="flex flex-col gap-3 bg-surface-2 px-4 py-3">
      {stages.map(([stage, list]) => (
        <div key={stage}>
          {stage && <div className="mb-1 text-[10.5px] uppercase tracking-wide text-fg-mute">{stage}</div>}
          <div className="flex flex-col gap-1.5">
            {list.map((j) => (
              <div key={j.id} className="rounded-md border border-line bg-surface">
                <div className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
                  <StatusChip s={j.status} />
                  <span className="min-w-0 flex-1 truncate font-semibold" title={j.name}>{j.name}</span>
                  {j.allowFailure && j.status === 'failed' && <Chip tone="muted" title="allow_failure: không làm hỏng pipeline">Cho phép lỗi</Chip>}
                  {j.reason && <span className="mono truncate text-[11px] text-fg-mute" title={j.reason}>{j.reason}</span>}
                  <span className="w-[60px] flex-none text-right text-[11.5px] text-fg-mute">{fmtDur(j.durationSec)}</span>
                  {safeUrl(j.url) && <a className="text-[12px] text-ahead" href={safeUrl(j.url)} target="_blank" rel="noopener noreferrer">Mở</a>}
                </div>
                {j.log && <pre className="mono max-h-[220px] overflow-auto whitespace-pre-wrap break-words border-t border-line px-3 py-2 text-[11px] leading-snug text-fg-soft">{j.log}</pre>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Pipeline (GitLab) / workflow run (GitHub) gần nhất của một project; bấm một dòng để xem job và log job lỗi. */
export function RemotePipelines({ projects }: { projects: ProjectEntry[]; accounts: RemoteAccount[] }) {
  // Dùng chung lựa chọn project với tab Branches
  const [sel, setSel] = usePersisted<string>('remotes.branchProject', '', (v) => typeof v === 'string')
  const [open, setOpen] = useState<string | null>(null)
  const [onlyFail, setOnlyFail] = useState(false)
  const options = useMemo(() => projects.map((p) => ({ value: `${p.accountId}|${fullPath(p)}`, label: fullPath(p) })), [projects])
  const all = !sel || options.some((o) => o.value === sel) ? options : [{ value: sel, label: sel.slice(sel.indexOf('|') + 1) }, ...options]
  const cur = all.find((o) => o.value === sel) ?? all[0]
  const accountId = cur ? cur.value.slice(0, cur.value.indexOf('|')) : ''
  const project = cur ? cur.value.slice(cur.value.indexOf('|') + 1) : ''
  const data = useLoad(() => (cur ? api.pipelines(accountId, project) : Promise.resolve(null)), [cur?.value], 30000)
  const runs = (data.data ?? []).filter((r) => !onlyFail || r.status === 'failed')
  const fail = (data.data ?? []).filter((r) => r.status === 'failed').length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-fg-mute" htmlFor="pl-proj">Project</label>
        <select id="pl-proj" className="min-w-[240px]" value={cur?.value ?? ''} onChange={(e) => { setSel(e.target.value); setOpen(null) }}>
          {all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-fg-mute"><input type="checkbox" checked={onlyFail} onChange={(e) => setOnlyFail(e.target.checked)} />Chỉ pipeline lỗi{fail > 0 ? ` (${fail})` : ''}</label>
      </div>

      {!cur && <div className="banner">Chưa có project nào. Chọn project ở tab Branches (gõ <span className="mono">group/project</span>) rồi quay lại đây.</div>}
      {data.error && <div className="banner err" role="alert">Không tải được pipeline: {data.error}</div>}
      {data.loading && !data.data && <Spinner label="Đang lấy pipeline từ remote…" />}

      {data.data && runs.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-border bg-surface" role="list" aria-label="Pipeline gần nhất">
          {runs.map((r) => (
            <div role="listitem" key={r.id} className="border-b border-line last:border-b-0">
              <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#1F2124]" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span className="w-3 flex-none text-fg-mute" aria-hidden="true">{open === r.id ? '▾' : '▸'}</span>
                <StatusChip s={r.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="mono truncate text-[13px] font-semibold" title={r.ref}>{r.ref || '(không có nhánh)'}</span>
                    {r.title && <span className="truncate text-[12px] text-fg-soft" title={r.title}>{r.title}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-mute">
                    <span className="mono">#{r.id}</span>·<span className="mono">{r.sha}</span>{r.source && <>·<span>{r.source}</span></>}
                  </div>
                </div>
                <span className="w-[70px] flex-none text-right text-[12px] text-fg-mute">{fmtDur(r.durationSec)}</span>
                <span className="w-[80px] flex-none text-right text-[12px] text-fg-mute" title={new Date(r.createdAt).toLocaleString('vi-VN')}>{relTime(r.createdAt)}</span>
              </button>
              {open === r.id && (
                <>
                  <Jobs accountId={accountId} project={project} run={r} />
                  {safeUrl(r.url) && <div className="border-t border-line bg-surface-2 px-4 py-2 text-[12px]"><a className="text-ahead" href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer">Mở trên remote</a></div>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {data.data && !runs.length && <div className="banner">{onlyFail ? 'Không có pipeline lỗi trong 30 lượt gần nhất.' : 'Project chưa có pipeline nào (hoặc CI chưa bật).'}</div>}
      {data.data && <div className="text-[12px] text-fg-mute">{data.data.length} lượt gần nhất · tự làm mới mỗi 30 giây · GitHub không có log trong app, dùng link “Mở”</div>}
    </div>
  )
}
