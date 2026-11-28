import { useEffect } from 'react'
import { api } from '../api'
import type { JiraNewItem } from '../types'
import { systemNotify } from './platform'
import { navigate } from './router'
import { setState, toast } from './store'

const NOTIFIED_KEY = 'jira.notified'
const WATCH_MS = 120000

const id = (key: string, kind: string, text: string) => `${key}|${kind}|${text}`

/** Sự kiện chưa từng báo, gom theo ticket. Lần đầu (chưa có danh sách đã báo) chỉ ghi nhớ, không báo dồn. */
export function freshEvents(notified: string[] | null, items: JiraNewItem[]): { next: string[]; fresh: { key: string; text: string }[] } {
  const all = items.flatMap((i) => i.events.map((e) => id(i.issue.key, e.kind, e.text)))
  if (!notified) return { next: all, fresh: [] }
  const had = new Set(notified)
  const fresh = items.flatMap((i) => i.events.filter((e) => !had.has(id(i.issue.key, e.kind, e.text))).map((e) => ({ key: i.issue.key, text: e.text })))
  return { next: [...new Set([...notified, ...all])].slice(-500), fresh }
}

/** Người dùng đã xem ticket: quên các sự kiện đã báo của nó (hoặc tất cả), để lần đổi sau trùng nội dung (vd quay lại cùng trạng thái) vẫn được báo. */
export function forgetNotified(key?: string) {
  const cur = read()
  if (!cur) return
  write(key ? cur.filter((x) => !x.startsWith(key + '|')) : [])
}

const read = (): string[] | null => { try { const v = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || 'null'); return Array.isArray(v) ? v : null } catch { return null } }
const write = (v: string[]) => { try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(v)) } catch { /* bỏ qua */ } }

async function poll() {
  if (!(await api.jiraAccounts()).length) { setState({ jiraUnread: 0 }); return }
  const r = await api.jiraNew()
  setState({ jiraUnread: r.items.filter((i) => i.events.length).length })
  const f = freshEvents(read(), r.items)
  write(f.next)
  if (!f.fresh.length) return
  const first = f.fresh[0]
  const title = f.fresh.length === 1 ? `Jira ${first.key}` : `${f.fresh.length} cập nhật ticket Jira`
  const body = f.fresh.length === 1 ? first.text : f.fresh.slice(0, 3).map((e) => `${e.key}: ${e.text}`).join('\n')
  systemNotify(title, body)
  toast({ kind: 'ok', title, detail: body, onOpen: () => navigate('/jira') })
}

/** Poll nền ticket Jira của tôi và đã ghim, báo khi có thay đổi (mount một lần ở App). */
export function useJiraWatch() {
  useEffect(() => {
    let stop = false
    const run = () => { if (!stop && document.visibilityState !== 'hidden') poll().catch(() => { /* lỗi mạng: lần sau thử lại */ }) }
    const first = setTimeout(run, 8000)
    const t = setInterval(run, WATCH_MS)
    return () => { stop = true; clearTimeout(first); clearInterval(t) }
  }, [])
}
