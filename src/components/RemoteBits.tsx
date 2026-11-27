import type { ChangeRequest, CiState, RemoteProvider } from '../types'
import { copyText } from '../lib/platform'
import { toast } from '../lib/store'
import { Chip } from './ui'

export const PROVIDER_LABEL: Record<RemoteProvider, string> = { gitlab: 'GitLab', github: 'GitHub' }
export const CR_WORD: Record<RemoteProvider, string> = { gitlab: 'MR', github: 'PR' }
/** Số hiệu hiển thị: GitLab dùng !123, GitHub dùng #123. */
export const crRef = (c: Pick<ChangeRequest, 'provider' | 'number'>) => (c.provider === 'gitlab' ? '!' : '#') + c.number

/** Chỉ cho mở link http(s) lấy từ dữ liệu remote. */
export const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : undefined)

export function ProviderTag({ provider }: { provider: RemoteProvider }) {
  return (
    <span className={'inline-flex size-7 flex-none items-center justify-center rounded-md text-[10.5px] font-bold ' + (provider === 'gitlab' ? 'bg-[#2A1F3D] text-[#C9A8FF]' : 'bg-[#1F2A24] text-[#8FE0B0]')}
      title={PROVIDER_LABEL[provider]}>{provider === 'gitlab' ? 'GL' : 'GH'}</span>
  )
}

const CI: Record<CiState, { tone: 'ok' | 'danger' | 'info' | 'behind' | 'muted'; label: string }> = {
  success: { tone: 'ok', label: 'CI pass' }, failed: { tone: 'danger', label: 'CI lỗi' }, running: { tone: 'info', label: 'CI chạy' },
  pending: { tone: 'behind', label: 'CI chờ' }, canceled: { tone: 'muted', label: 'CI hủy' }, none: { tone: 'muted', label: 'Chưa có CI' },
}
export const CiChip = ({ ci }: { ci: CiState }) => (ci === 'none' ? null : <Chip tone={CI[ci].tone}>{CI[ci].label}</Chip>)
export const ciTone = (s: CiState | 'none') => CI[s as CiState]?.tone ?? 'muted'

export function ApprovalChip({ a }: { a: ChangeRequest['approvals'] }) {
  if (!a) return null
  if (a.changes) return <Chip tone="behind">Yêu cầu sửa</Chip>
  if (a.approved) return <Chip tone="ok">Approved</Chip>
  return <Chip tone="muted">{a.need !== null ? `${a.have}/${a.need} approve` : 'Chưa approve'}</Chip>
}

export function ThreadChip({ t }: { t: ChangeRequest['threads'] }) {
  if (!t || t.total === 0) return null
  return t.resolved === t.total ? <Chip tone="ok" title="Mọi thread đã resolve">Resolved</Chip> : <Chip tone="behind" title="Thread đã resolve / tổng">Thread {t.resolved}/{t.total}</Chip>
}

export const unresolved = (c: ChangeRequest) => (c.threads ? c.threads.total - c.threads.resolved : 0)

/** Chép link MR / PR vào clipboard và báo kết quả. */
export async function copyCrLink(c: Pick<ChangeRequest, 'provider' | 'number' | 'url'>) {
  const ok = await copyText(c.url)
  toast(ok ? { kind: 'ok', title: `Đã chép link ${CR_WORD[c.provider]} ${crRef(c)}`, detail: c.url } : { kind: 'err', title: 'Không chép được link' })
}
