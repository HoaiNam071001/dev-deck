// REST Jira. Cloud: /rest/api/3 + Basic (email:token). Server / Data Center: /rest/api/2 + Bearer (PAT).
// Chỉ gọi tới đúng baseUrl của account. Chỉ đọc (giai đoạn 13a).
const { request } = require('../remotes/http')

const FIELDS = 'summary,status,assignee,priority,issuetype,customfield_10020,description,updated,comment'
const KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g

const api = (acc) => acc.baseUrl + (acc.kind === 'cloud' ? '/rest/api/3' : '/rest/api/2')
const headers = (acc) => ({
  authorization: acc.kind === 'cloud'
    ? 'Basic ' + Buffer.from(`${acc.email}:${acc.token}`).toString('base64')
    : 'Bearer ' + acc.token,
})
const get = (acc, p) => request(api(acc) + p, { headers: headers(acc) }).then((r) => r.data)

/** Mã ticket trong một đoạn chữ; `projects` (Set) lọc bỏ chuỗi giống mã như UTF-8, ISO-8601. */
function extractKeys(text, projects) {
  const out = new Set()
  for (const m of String(text || '').matchAll(KEY_RE)) {
    if (!projects || projects.has(m[0].slice(0, m[0].lastIndexOf('-')))) out.add(m[0])
  }
  return [...out]
}

/** Mô tả / comment Cloud ở dạng ADF → chữ thuần. Server / DC đã là chữ. */
function adfText(n) {
  if (n == null) return ''
  if (typeof n === 'string') return n
  if (n.type === 'text') return n.text || ''
  if (n.type === 'hardBreak') return '\n'
  if (n.type === 'mention') return n.attrs?.text || ''
  const inner = (n.content || []).map(adfText).join('')
  return ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(n.type) ? inner + '\n' : inner
}

const CATEGORY = { new: 'todo', indeterminate: 'doing', done: 'done' }
/** Chuẩn hóa một issue (cả hai bản API) về dạng chung cho giao diện. */
function normalize(acc, i) {
  const f = i.fields || {}
  const sprints = Array.isArray(f.customfield_10020) ? f.customfield_10020 : []
  const sp = sprints.find((s) => s?.state === 'active') || sprints[sprints.length - 1]
  const desc = adfText(f.description).trim()
  return {
    key: i.key,
    summary: f.summary || '',
    status: f.status?.name || '',
    category: CATEGORY[f.status?.statusCategory?.key] || 'todo',
    assignee: f.assignee?.displayName || '',
    priority: f.priority?.name || '',
    type: f.issuetype?.name || '',
    sprint: sp?.name || '',
    description: desc.slice(0, 4000),
    url: `${acc.baseUrl}/browse/${i.key}`,
    updated: f.updated || '',
    comments: (f.comment?.comments || []).slice(-20).map((c) => ({ id: String(c.id), author: c.author?.displayName || '', mine: !!acc.user && c.author?.displayName === acc.user, body: adfText(c.body).trim().slice(0, 200) })),
  }
}

async function whoami(acc) {
  const me = await get(acc, '/myself')
  return { user: me.displayName || me.name || me.emailAddress || '' }
}
async function projectKeys(acc) {
  const p = await get(acc, '/project')
  return (Array.isArray(p) ? p : []).map((x) => x.key).filter(Boolean)
}
async function search(acc, jql, max = 50) {
  const q = new URLSearchParams({ jql, fields: FIELDS, maxResults: String(max) })
  // Jira Cloud đã gỡ /search (HTTP 410), thay bằng /search/jql; Server / DC vẫn dùng /search
  const r = await get(acc, (acc.kind === 'cloud' ? '/search/jql?' : '/search?') + q)
  return (r?.issues || []).map((i) => normalize(acc, i))
}

const send = (acc, p, method, body) => request(api(acc) + p, { method, headers: { ...headers(acc), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.data)
/** Cloud (v3) nhận comment / ghi chú dạng ADF; Server / DC (v2) nhận chữ thuần. */
const rich = (acc, text) => acc.kind === 'cloud'
  ? { type: 'doc', version: 1, content: String(text).split(/\n{2,}/).map((para) => ({ type: 'paragraph', content: para.split('\n').flatMap((l, i) => (i ? [{ type: 'hardBreak' }] : []).concat(l ? [{ type: 'text', text: l }] : [])) })) }
  : String(text)

async function transitions(acc, key) {
  const r = await get(acc, `/issue/${key}/transitions`)
  return (r?.transitions || []).map((t) => ({ id: String(t.id), name: t.name || '', to: t.to?.name || '' }))
}
const transition = (acc, key, id) => send(acc, `/issue/${key}/transitions`, 'POST', { transition: { id: String(id) } })
const comment = (acc, key, text) => send(acc, `/issue/${key}/comment`, 'POST', { body: rich(acc, text) })
const worklog = (acc, key, seconds, text) => send(acc, `/issue/${key}/worklog`, 'POST', { timeSpentSeconds: seconds, ...(text ? { comment: rich(acc, text) } : {}) })

module.exports = { transitions, transition, comment, worklog, rich, extractKeys, adfText, normalize, whoami, projectKeys, search, KEY_RE }
