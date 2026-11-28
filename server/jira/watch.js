// Theo dõi ticket (13d, chỉ đọc với Jira): ghim + mốc "đã xem" lưu cục bộ ở data/jira-watch.json.
// So sánh ảnh chụp ticket với mốc đã xem để biết cái gì đổi; lần đầu thấy một ticket chỉ lấy mốc, không báo dồn.
const fs = require('fs')
const path = require('path')

const FILE = path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data'), 'jira-watch.json')
const KEY = /^[A-Z][A-Z0-9]+-\d+$/
const MAX_PINS = 50

function read() {
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); return { follows: Array.isArray(d.follows) ? d.follows.filter((f) => f && f.id && f.jql && f.account) : [], pinned: Array.isArray(d.pinned) ? d.pinned.filter((k) => KEY.test(k)) : [], seen: d.seen && typeof d.seen === 'object' ? d.seen : {} } } catch { return { follows: [], pinned: [], seen: {} } }
}
function write(d) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)) }

function pin(key, on) {
  if (!KEY.test(key)) throw new Error('Mã ticket không hợp lệ')
  const d = read()
  const set = new Set(d.pinned)
  if (on) { if (set.size >= MAX_PINS && !set.has(key)) throw new Error('Ghim tối đa ' + MAX_PINS + ' ticket'); set.add(key) } else set.delete(key)
  d.pinned = [...set]
  write(d)
  return d.pinned
}
const pinned = () => read().pinned

/** Ảnh chụp những thứ cần so sánh. */
const snapshot = (i) => ({ status: i.status, assignee: i.assignee, priority: i.priority, sprint: i.sprint, lastComment: i.comments.at(-1)?.id || '' })

/** Sự kiện = khác biệt giữa mốc đã xem và hiện tại. Comment mới của chính mình bị bỏ. */
function diff(prev, issue) {
  const ev = []
  if (prev.status !== issue.status) ev.push({ kind: 'status', text: `${prev.status} → ${issue.status}` })
  if (prev.assignee !== issue.assignee) ev.push({ kind: 'assignee', text: `${prev.assignee || 'Chưa giao'} → ${issue.assignee || 'Chưa giao'}` })
  if (prev.priority !== issue.priority) ev.push({ kind: 'priority', text: `${prev.priority || '—'} → ${issue.priority || '—'}` })
  if (prev.sprint !== issue.sprint) ev.push({ kind: 'sprint', text: `${prev.sprint || '—'} → ${issue.sprint || '—'}` })
  const at = prev.lastComment ? issue.comments.findIndex((c) => c.id === prev.lastComment) : -1
  const fresh = prev.lastComment && at < 0 ? issue.comments : issue.comments.slice(at + 1)
  for (const c of prev.lastComment === undefined ? [] : fresh) if (!c.mine) ev.push({ kind: 'comment', text: `${c.author}: “${c.body.split('\n')[0].slice(0, 120)}”` })
  return ev
}

/** Đối chiếu danh sách ticket hiện tại với mốc đã xem. Ticket mới thấy lần đầu: ghi mốc, không có sự kiện. */
function compare(issues) {
  const d = read()
  let dirty = false
  const out = issues.map((i) => {
    const prev = d.seen[i.key]
    if (!prev) { d.seen[i.key] = snapshot(i); dirty = true; return { key: i.key, events: [] } }
    return { key: i.key, events: diff(prev, i) }
  })
  if (dirty) write(d)
  return out
}

/** Đánh dấu đã xem: ghi mốc bằng trạng thái hiện tại của các ticket. */
function markSeen(issues) {
  const d = read()
  for (const i of issues) d.seen[i.key] = snapshot(i)
  write(d)
}

const MAX_FOLLOWS = 10
const follows = () => read().follows

/** Theo dõi một nhóm ticket theo JQL (theo người hoặc JQL tự viết). Chỉ lưu cục bộ. */
function addFollow({ account, label, jql }) {
  const q = String(jql || '').trim()
  if (!q) throw new Error('Cần nhập JQL')
  if (q.length > 500) throw new Error('JQL quá dài (tối đa 500 ký tự)')
  const d = read()
  if (d.follows.length >= MAX_FOLLOWS) throw new Error('Theo dõi tối đa ' + MAX_FOLLOWS + ' nhóm')
  if (d.follows.some((f) => f.account === account && f.jql === q)) throw new Error('Đã theo dõi nhóm này')
  const f = { id: require('crypto').randomUUID(), account: String(account), label: String(label || q).trim().slice(0, 80), jql: q }
  d.follows.push(f)
  write(d)
  return f
}
function removeFollow(id) { const d = read(); d.follows = d.follows.filter((f) => f.id !== id); write(d); return d.follows }

module.exports = { follows, addFollow, removeFollow, pin, pinned, compare, markSeen, diff, snapshot }
