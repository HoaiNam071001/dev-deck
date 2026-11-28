// REST Jira. Cloud: /rest/api/3 + Basic (email:token). Server / Data Center: /rest/api/2 + Bearer (PAT).
// Chỉ gọi tới đúng baseUrl của account. Chỉ đọc (giai đoạn 13a).
const { request } = require('../remotes/http')

const FIELDS = 'summary,status,assignee,priority,issuetype,customfield_10020,description'
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
  const r = await get(acc, '/search?' + q)
  return (r?.issues || []).map((i) => normalize(acc, i))
}

module.exports = { extractKeys, adfText, normalize, whoami, projectKeys, search, KEY_RE }
