import { useEffect } from 'react'
import { api } from '../api'
import { unresolved } from '../components/RemoteBits'
import type { ChangeRequest } from '../types'
import { systemNotify } from './platform'
import { currentRoute } from './router'
import { setState, toast } from './store'

const SEEN_KEY = 'remote.seen'
const READ_KEY = 'remote.read'
const WATCH_MS = 120000

/** Phần trạng thái của một MR / PR đủ để nhận ra thay đổi đáng báo. */
export interface CrSnap { ci: string; threads: number; open: number; conflict: boolean; reviewMe: boolean }
export type Seen = Record<string, CrSnap>
export interface CrEvent { key: string; title: string; body: string }

const snap = (c: ChangeRequest): CrSnap => ({ ci: c.ci, threads: c.threads?.total ?? 0, open: unresolved(c), conflict: c.conflict === true, reviewMe: c.reviewMe })

/**
 * So danh sách hiện tại với lần thấy trước. Chưa có `prev` (lần đầu) thì chỉ ghi nhớ, không báo.
 * MR của tôi: CI chuyển sang lỗi, có thread mới, bị conflict. MR cần tôi review: mới xuất hiện.
 */
export function diffCrs(prev: Seen | null, items: ChangeRequest[]): { next: Seen; events: CrEvent[] } {
  const next: Seen = {}
  const events: CrEvent[] = []
  for (const c of items) {
    if (c.state !== 'opened') continue
    const cur = snap(c)
    next[c.key] = cur
    const old = prev?.[c.key]
    if (!prev) continue
    const ref = `${c.project} #${c.number}`
    if (c.reviewMe && !c.mine && (!old || !old.reviewMe)) { events.push({ key: c.key, title: 'Cần bạn review', body: `${ref} · ${c.title}` }); continue }
    if (!c.mine || !old) continue
    if (cur.ci === 'failed' && old.ci !== 'failed') events.push({ key: c.key, title: 'Pipeline lỗi', body: `${ref} · ${c.title}` })
    if (cur.open > old.open) events.push({ key: c.key, title: 'Thread review mới', body: `${ref} · ${cur.open} thread chưa resolve` })
    else if (cur.threads > old.threads) events.push({ key: c.key, title: 'Có comment mới', body: `${ref} · ${c.title}` })
    if (cur.conflict && !old.conflict) events.push({ key: c.key, title: 'MR bị conflict', body: `${ref} · ${c.title}` })
  }
  return { next, events }
}

/** Số thread của từng MR / PR (đang mở) tại lần mở tab Remotes gần nhất. */
export type ReadMark = Record<string, number>

/**
 * Đếm thread mới chưa xem: số thread tăng thêm so với mốc đã xem. MR chưa có trong mốc (mới xuất hiện) tính cả thread đang có.
 * Chưa có mốc (lần đầu) thì lấy hiện tại làm mốc, đếm 0. Thread bị xóa thì hạ mốc theo để thread mới sau đó vẫn được đếm.
 */
export function unreadThreads(read: ReadMark | null, items: ChangeRequest[]): { count: number; read: ReadMark } {
  const next: ReadMark = {}
  let count = 0
  for (const c of items) {
    if (c.state !== 'opened') continue
    const cur = c.threads?.total ?? 0
    const base = read ? (read[c.key] ?? 0) : cur
    count += Math.max(0, cur - base)
    next[c.key] = Math.min(base, cur)
  }
  return { count, read: next }
}

const readMark = (): ReadMark | null => {
  try { const v = JSON.parse(localStorage.getItem(READ_KEY) || 'null'); return v && typeof v === 'object' ? (v as ReadMark) : null } catch { return null }
}
const writeMark = (m: ReadMark) => { try { localStorage.setItem(READ_KEY, JSON.stringify(m)) } catch { /* bỏ qua */ } }

/** Danh sách lần poll gần nhất, để đánh dấu đã xem khi mở tab Remotes mà không phải gọi API lại. */
let latest: ChangeRequest[] | null = null

/** Mở tab Remotes: mọi thread hiện có coi như đã xem, badge về 0. */
export function markRemotesRead() {
  setState({ remoteUnread: 0 })
  if (!latest) return
  const cur: ReadMark = {}
  for (const c of latest) if (c.state === 'opened') cur[c.key] = c.threads?.total ?? 0
  writeMark(cur)
}

const readSeen = (): Seen | null => {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); return v && typeof v === 'object' ? (v as Seen) : null } catch { return null }
}
const writeSeen = (s: Seen) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)) } catch { /* bỏ qua */ } }

async function poll() {
  const accounts = await api.remoteAccounts()
  if (!accounts.length) return
  const [mine, review] = await Promise.all([api.changeRequests('all', 'mine', 'opened'), api.changeRequests('all', 'review', 'opened')])
  // Account lỗi thì danh sách thiếu: không cập nhật mốc để tránh báo nhầm khi account hoạt động lại
  if (mine.errors.length || review.errors.length) return
  const byKey = new Map<string, ChangeRequest>()
  for (const c of [...mine.items, ...review.items]) byKey.set(c.key, byKey.get(c.key) ? { ...c, mine: c.mine || byKey.get(c.key)!.mine, reviewMe: c.reviewMe || byKey.get(c.key)!.reviewMe } : c)
  const all = [...byKey.values()]
  latest = all
  if (currentRoute() === '/remotes') markRemotesRead()
  else {
    const u = unreadThreads(readMark(), all)
    writeMark(u.read)
    setState({ remoteUnread: u.count })
  }
  const { next, events } = diffCrs(readSeen(), all)
  writeSeen(next)
  if (!events.length) return
  const first = events[0]
  const title = events.length === 1 ? first.title : `${events.length} cập nhật MR / PR`
  const body = events.length === 1 ? first.body : events.slice(0, 3).map((e) => `${e.title}: ${e.body}`).join('\n')
  systemNotify(title, body)
  toast({ kind: events.some((e) => e.title === 'Pipeline lỗi' || e.title === 'MR bị conflict') ? 'err' : 'ok', title, detail: body })
}

/** Poll nền MR / PR của tôi và cần tôi review, báo khi có thay đổi (mount một lần ở App). */
export function useRemoteWatch() {
  useEffect(() => {
    let stop = false
    const run = () => { if (!stop) poll().catch(() => { /* lỗi mạng: thử lại lần sau */ }) }
    const first = setTimeout(run, 5000)
    const t = setInterval(run, WATCH_MS)
    return () => { stop = true; clearTimeout(first); clearInterval(t) }
  }, [])
}
