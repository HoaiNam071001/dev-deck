// GitLab (gitlab.com hoặc tự host): Merge Request qua REST API v4. Chỉ đọc.
const { request, pool, cached } = require('./http')

const api = (acc, p) => `${acc.baseUrl}/api/v4${p}`
const get = (acc, p) => request(api(acc, p), { headers: { 'private-token': acc.token } })

const CI = {
  success: 'success', failed: 'failed', running: 'running', canceled: 'canceled', skipped: 'none',
  pending: 'pending', created: 'pending', preparing: 'pending', scheduled: 'pending', manual: 'pending', waiting_for_resource: 'pending',
}
const ci = (s) => CI[s] || 'none'
const person = (u) => ({ name: u?.name || u?.username || '?', username: u?.username || '' })

/** Kiểm tra token và lấy username của chủ token. */
async function whoami(acc) {
  const { data } = await get(acc, '/user')
  if (!data?.username) throw new Error('Token không hợp lệ')
  return { user: data.username }
}

/** Thread (discussion có thể resolve) → danh sách chuẩn hóa. Bỏ ghi chú hệ thống và comment lẻ. */
function threadsOf(discussions) {
  const out = []
  for (const d of discussions) {
    const notes = (d.notes || []).filter((n) => !n.system)
    const first = notes[0]
    if (!first || !first.resolvable) continue
    const pos = first.position || {}
    out.push({
      id: String(d.id),
      resolved: notes.filter((n) => n.resolvable).every((n) => n.resolved),
      outdated: false,
      path: pos.new_path || pos.old_path || null,
      line: pos.new_line ?? pos.old_line ?? null,
      comments: notes.map((n) => ({ author: person(n.author), body: String(n.body || ''), createdAt: n.created_at, url: null })),
    })
  }
  return out
}

async function discussions(acc, project, iid, pages) {
  let all = []
  for (let page = 1; page <= pages; page++) {
    const { data, headers } = await get(acc, `/projects/${project}/merge_requests/${iid}/discussions?per_page=100&page=${page}`)
    all = all.concat(data || [])
    if (!headers.get('x-next-page')) break
  }
  return all
}

/** Số approve: GitLab bản miễn phí có thể trả 403/404 → null (UI ẩn). */
async function approvals(acc, project, iid) {
  try {
    const { data } = await get(acc, `/projects/${project}/merge_requests/${iid}/approvals`)
    const have = (data.approved_by || []).length
    const left = typeof data.approvals_left === 'number' ? data.approvals_left : null
    const need = typeof data.approvals_required === 'number' ? data.approvals_required : (left === null ? null : have + left)
    return { have, need, approved: !!data.approved, changes: false, by: (data.approved_by || []).map((a) => person(a.user).name) }
  } catch { return null }
}

function base(acc, m, me) {
  return {
    key: `${acc.id}|${m.project_id}|${m.iid}`,
    accountId: acc.id, provider: 'gitlab',
    number: m.iid, title: m.title, url: m.web_url,
    project: (m.references?.full || '').replace(/!\d+$/, '') || String(m.project_id),
    source: m.source_branch, target: m.target_branch,
    author: person(m.author), draft: !!(m.draft ?? m.work_in_progress),
    state: m.state === 'merged' ? 'merged' : m.state === 'closed' ? 'closed' : 'opened',
    createdAt: m.created_at, updatedAt: m.updated_at,
    conflict: typeof m.has_conflicts === 'boolean' ? m.has_conflicts : null,
    ci: 'none', approvals: null, threads: null,
    reviewers: (m.reviewers || []).map(person),
    mine: m.author?.username === me,
    reviewMe: (m.reviewers || []).some((r) => r.username === me),
  }
}

/** Bổ sung CI, approve, thread cho một MR (3 request, cache 60 giây). */
function enrich(acc, m, me) {
  return cached(`gl:${acc.id}:${m.project_id}:${m.iid}:sum`, 60000, async () => {
    const cr = base(acc, m, me)
    const [one, ap, dis] = await Promise.all([
      get(acc, `/projects/${m.project_id}/merge_requests/${m.iid}`).then((r) => r.data).catch(() => null),
      approvals(acc, m.project_id, m.iid),
      discussions(acc, m.project_id, m.iid, 1).catch(() => null),
    ])
    if (one?.head_pipeline) cr.ci = ci(one.head_pipeline.status)
    if (one && typeof one.has_conflicts === 'boolean') cr.conflict = one.has_conflicts
    cr.approvals = ap ? { have: ap.have, need: ap.need, approved: ap.approved, changes: ap.changes } : null
    if (dis) { const t = threadsOf(dis); cr.threads = { resolved: t.filter((x) => x.resolved).length, total: t.length } }
    return cr
  })
}

const SCOPES = { mine: 'scope=created_by_me', assigned: 'scope=assigned_to_me' }

/** Mọi MR (kể cả của người khác) trong các project tôi là thành viên: 15 project hoạt động gần nhất, mỗi project 15 MR. */
async function listAll(acc, state) {
  const me = acc.user
  const { data: projs } = await get(acc, '/projects?membership=true&simple=true&archived=false&order_by=last_activity_at&sort=desc&per_page=15')
  const parts = await pool(projs || [], 5, (p) => get(acc, `/projects/${p.id}/merge_requests?state=${state}&order_by=updated_at&sort=desc&per_page=15`).then((r) => r.data || []).catch(() => []))
  const mrs = parts.flat().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 40)
  return pool(mrs, 6, (m) => enrich(acc, m, me).catch(() => base(acc, m, me)))
}

async function list(acc, { scope, state }) {
  const me = acc.user
  if (scope === 'all') return listAll(acc, state === 'merged' || state === 'closed' ? state : 'opened')
  const q = scope === 'review' ? `scope=all&reviewer_username=${encodeURIComponent(me)}` : (SCOPES[scope] || SCOPES.mine)
  const s = state === 'merged' || state === 'closed' ? state : 'opened'
  const { data } = await get(acc, `/merge_requests?${q}&state=${s}&order_by=updated_at&sort=desc&per_page=40`)
  return pool(data || [], 6, (m) => enrich(acc, m, me).catch(() => base(acc, m, me)))
}

/** MR của một nhánh nguồn trong project (đường dẫn "group/proj"), mới cập nhật nhất trước. */
async function byBranch(acc, projectPath, branch) {
  const { data } = await get(acc, `/projects/${encodeURIComponent(projectPath)}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&order_by=updated_at&sort=desc&per_page=5`)
  return pool(data || [], 5, (m) => enrich(acc, m, acc.user).catch(() => base(acc, m, acc.user)))
}

/** 50 MR mới cập nhật nhất của project (mọi trạng thái), không bổ sung CI/approve/thread để nhẹ request. */
async function byProject(acc, projectPath) {
  const { data } = await get(acc, `/projects/${encodeURIComponent(projectPath)}/merge_requests?state=all&order_by=updated_at&sort=desc&per_page=50`)
  return (data || []).map((m) => base(acc, m, acc.user))
}

/** Nhánh của project trên remote: commit cuối, mặc định / bảo vệ, đã merge vào nhánh mặc định chưa. Tối đa 100 nhánh mới nhất. */
async function branches(acc, projectPath) {
  const p = encodeURIComponent(projectPath)
  const [{ data: proj }, { data }] = await Promise.all([
    get(acc, `/projects/${p}`),
    get(acc, `/projects/${p}/repository/branches?per_page=100`),
  ])
  const list = (data || []).map((b) => ({
    name: b.name, isDefault: !!b.default, protected: !!b.protected, merged: b.default ? null : !!b.merged,
    commit: b.commit ? { sha: String(b.commit.id || '').slice(0, 8), title: b.commit.title || '', author: b.commit.author_name || '', date: b.commit.committed_date || b.commit.created_at || '', url: b.commit.web_url || null } : null,
  }))
  return { defaultBranch: proj?.default_branch || null, url: proj?.web_url || null, branches: list }
}

/** 40 dòng cuối log của job (bỏ mã màu ANSI, tối đa 4000 ký tự); không đọc được thì null. */
function jobLogTail(acc, project, jobId) {
  return cached(`gl:${acc.id}:${project}:job${jobId}:log`, 5 * 60000, async () => {
    try {
      const { text } = await get(acc, `/projects/${project}/jobs/${jobId}/trace`)
      const clean = String(text || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '\n').replace(/\n{2,}/g, '\n')
      return clean.split('\n').slice(-40).join('\n').slice(-4000).trim() || null
    } catch { return null }
  })
}

const secs = (a, b) => { const d = (Date.parse(b) - Date.parse(a)) / 1000; return Number.isFinite(d) && d >= 0 ? Math.round(d) : null }
const DONE = new Set(['success', 'failed', 'canceled', 'skipped'])

/** 30 pipeline mới nhất của project (đường dẫn "group/proj"). Thời gian chạy ước từ created → updated khi đã kết thúc. */
async function pipelines(acc, projectPath) {
  const { data } = await get(acc, `/projects/${encodeURIComponent(projectPath)}/pipelines?per_page=30&order_by=id&sort=desc`)
  return (data || []).map((p) => ({
    id: String(p.id), title: '', status: ci(p.status), ref: p.ref || '', sha: String(p.sha || '').slice(0, 8), source: p.source || '',
    url: p.web_url || null, createdAt: p.created_at, durationSec: DONE.has(p.status) ? secs(p.created_at, p.updated_at) : null,
  }))
}

/** Job của một pipeline; job lỗi (không allow_failure) kèm đoạn cuối log, tối đa 3 job. */
async function pipelineJobs(acc, projectPath, id) {
  const p = encodeURIComponent(projectPath)
  const { data } = await get(acc, `/projects/${p}/pipelines/${id}/jobs?per_page=100`)
  const jobs = data || []
  const bad = new Set(jobs.filter((j) => j.status === 'failed' && !j.allow_failure).slice(0, 3).map((j) => j.id))
  return pool(jobs, 4, async (j) => ({
    id: String(j.id), name: j.name, stage: j.stage || '', status: ci(j.status), durationSec: typeof j.duration === 'number' ? Math.round(j.duration) : null,
    url: j.web_url || null, allowFailure: !!j.allow_failure, reason: j.failure_reason || '', log: bad.has(j.id) ? await jobLogTail(acc, p, j.id) : null,
  }))
}

const STAGE_RANK ={ failed: 4, running: 3, pending: 2, canceled: 1, success: 0, none: -1 }

async function detail(acc, ref) {
  const [project, iid] = ref
  const me = acc.user
  const { data: m } = await get(acc, `/projects/${project}/merge_requests/${iid}`)
  const cr = base(acc, m, me)
  const [ap, dis] = await Promise.all([approvals(acc, project, iid), discussions(acc, project, iid, 3).catch(() => [])])
  cr.approvals = ap ? { have: ap.have, need: ap.need, approved: ap.approved, changes: false } : null
  const threads = threadsOf(dis)
  cr.threads = { resolved: threads.filter((x) => x.resolved).length, total: threads.length }
  let checks = []
  let failedJobs = []
  if (m.head_pipeline) {
    cr.ci = ci(m.head_pipeline.status)
    try {
      const { data: jobs } = await get(acc, `/projects/${project}/pipelines/${m.head_pipeline.id}/jobs?per_page=100`)
      const stages = new Map()
      for (const j of jobs || []) {
        const s = ci(j.status)
        const prev = stages.get(j.stage)
        if (prev === undefined || STAGE_RANK[s] > STAGE_RANK[prev]) stages.set(j.stage, s)
      }
      checks = [...stages].map(([name, status]) => ({ name, status }))
      const bad = (jobs || []).filter((j) => j.status === 'failed' && !j.allow_failure).slice(0, 3)
      failedJobs = await pool(bad, 3, async (j) => ({
        id: String(j.id), name: j.name, stage: j.stage, url: j.web_url || null,
        reason: j.failure_reason || '', log: await jobLogTail(acc, project, j.id),
      }))
    } catch { /* không đọc được job: bỏ qua */ }
  }
  return {
    ...cr, description: String(m.description || ''), threadList: threads, checks, failedJobs,
    approvedBy: ap?.by || [], mergeStatus: m.detailed_merge_status || m.merge_status || '',
    pipelineUrl: m.head_pipeline?.web_url || null,
  }
}

/** Khóa tham chiếu nội bộ từ key "accountId|projectId|iid". */
function parseKey(key) {
  const [, project, iid] = key.split('|')
  if (!/^[0-9]+$/.test(project || '') || !/^[0-9]+$/.test(iid || '')) throw new Error('Khóa MR không hợp lệ')
  return [project, iid]
}

module.exports = { whoami, list, byBranch, byProject, branches, pipelines, pipelineJobs, detail, parseKey }
