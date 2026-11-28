// GitHub (github.com hoặc Enterprise): Pull Request qua GraphQL (REST không có trạng thái resolved của thread). Chỉ đọc.
const { request } = require('./http')

const endpoint = (acc) => acc.baseUrl === 'https://github.com' ? 'https://api.github.com/graphql' : acc.baseUrl + '/api/graphql'

async function gql(acc, query, variables) {
  const { data } = await request(endpoint(acc), {
    method: 'POST',
    headers: { authorization: 'Bearer ' + acc.token, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (data?.errors?.length && !data.data) throw new Error(data.errors[0].message)
  return data.data
}

async function whoami(acc) {
  const d = await gql(acc, 'query { viewer { login } }', {})
  if (!d?.viewer?.login) throw new Error('Token không hợp lệ')
  return { user: d.viewer.login }
}

const ROLLUP = { SUCCESS: 'success', FAILURE: 'failed', ERROR: 'failed', PENDING: 'running', EXPECTED: 'pending' }
const person = (u) => ({ name: u?.name || u?.login || '?', username: u?.login || '' })

const PR_FIELDS = `
  number title url isDraft state createdAt updatedAt mergeable reviewDecision headRefName baseRefName
  repository { nameWithOwner }
  author { login ... on User { name } }
  reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login name } ... on Team { name } } } }
  latestOpinionatedReviews(first: 30) { nodes { state author { login } } }
  latestReviews(first: 30) { nodes { submittedAt author { login } } }
  additions deletions changedFiles
  timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 20) { nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } } } }
  reviewThreads(first: 100) { nodes { isResolved } }
  commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }`

function toCR(acc, p, me) {
  const reviews = p.latestOpinionatedReviews?.nodes || []
  const have = reviews.filter((r) => r.state === 'APPROVED').length
  const dec = p.reviewDecision
  const threads = p.reviewThreads?.nodes || []
  const reviewers = (p.reviewRequests?.nodes || []).map((n) => n.requestedReviewer).filter(Boolean).map((u) => ({ name: u.name || u.login || '?', username: u.login || '' }))
  return {
    key: `${acc.id}|${p.repository.nameWithOwner}|${p.number}`,
    accountId: acc.id, provider: 'github',
    number: p.number, title: p.title, url: p.url, project: p.repository.nameWithOwner,
    source: p.headRefName, target: p.baseRefName, author: person(p.author), draft: !!p.isDraft,
    state: p.state === 'MERGED' ? 'merged' : p.state === 'CLOSED' ? 'closed' : 'opened',
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    conflict: p.mergeable === 'CONFLICTING' ? true : p.mergeable === 'MERGEABLE' ? false : null,
    ci: ROLLUP[p.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] || 'none',
    approvals: { have, need: null, approved: dec === 'APPROVED' || (!dec && have > 0), changes: dec === 'CHANGES_REQUESTED' },
    threads: { resolved: threads.filter((t) => t.isResolved).length, total: threads.length },
    reviewers,
    mine: p.author?.login === me,
    reviewMe: reviewers.some((r) => r.username === me),
    // reviewRequests chỉ còn người chưa phản hồi; mốc = lần yêu cầu gần nhất của chính người đó
    waitingOn: reviewers.map((r) => ({ ...r, since: [...(p.timelineItems?.nodes || [])].reverse().find((n) => n?.requestedReviewer?.login === r.username)?.createdAt || null })),
    // Lần gần nhất tôi được yêu cầu review (nodes theo thứ tự cũ → mới)
    reviewRequestedAt: [...(p.timelineItems?.nodes || [])].reverse().find((n) => n?.requestedReviewer?.login === me)?.createdAt || null,
    myReviewAt: (p.latestReviews?.nodes || []).find((n) => n?.author?.login === me)?.submittedAt || null,
    lastCommitAt: p.commits?.nodes?.[0]?.commit?.committedDate || null,
    size: { additions: p.additions ?? null, deletions: p.deletions ?? null, files: p.changedFiles ?? null },
  }
}

/** Mọi repo tôi có quyền (không archived), tối đa 300, mới đẩy nhất trước. Dạng "owner/name". */
async function repos(acc) {
  const out = []
  let after = null
  for (let i = 0; i < 3; i++) {
    const r = await gql(acc, 'query($after: String) { viewer { repositories(first: 100, after: $after, isArchived: false, orderBy: { field: PUSHED_AT, direction: DESC }, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) { nodes { nameWithOwner } pageInfo { hasNextPage endCursor } } } }', { after })
    const c = r?.viewer?.repositories
    out.push(...(c?.nodes || []).map((n) => n.nameWithOwner).filter((n) => REPO_RE.test(n)))
    if (!c?.pageInfo?.hasNextPage) break
    after = c.pageInfo.endCursor
  }
  return out
}

const SAFE_LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$/

async function list(acc, { scope, state }) {
  const me = acc.user
  if (!SAFE_LOGIN.test(me)) throw new Error('Tên đăng nhập GitHub không hợp lệ')
  let who
  if (scope === 'all') {
    // Mọi PR trong 30 repo tôi có quyền, hoạt động gần nhất
    const r = await gql(acc, 'query { viewer { repositories(first: 30, isArchived: false, orderBy: { field: PUSHED_AT, direction: DESC }, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) { nodes { nameWithOwner } } } }', {})
    const repos = (r?.viewer?.repositories?.nodes || []).map((n) => n.nameWithOwner).filter((n) => REPO_RE.test(n))
    if (!repos.length) return []
    who = repos.map((n) => 'repo:' + n).join(' ')
  } else who = scope === 'review' ? `review-requested:${me}` : scope === 'assigned' ? `assignee:${me}` : `author:${me}`
  const st = state === 'merged' ? 'is:merged' : state === 'closed' ? 'is:closed -is:merged' : 'is:open'
  const q = `is:pr ${st} ${who} archived:false sort:updated-desc`
  const d = await gql(acc, `query($q: String!) { search(query: $q, type: ISSUE, first: 60) { nodes { ... on PullRequest { ${PR_FIELDS} } } } }`, { q })
  return (d?.search?.nodes || []).filter((p) => p && p.number).map((p) => toCR(acc, p, me))
}

/** PR có nhánh nguồn `branch` trong repo "owner/name"; từ chối giá trị có ký tự lạ (đi vào câu search). */
async function byBranch(acc, projectPath, branch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(projectPath) || !/^[\w./-]+$/.test(branch)) return []
  const q = `is:pr repo:${projectPath} head:${branch} sort:updated-desc`
  const d = await gql(acc, `query($q: String!) { search(query: $q, type: ISSUE, first: 5) { nodes { ... on PullRequest { ${PR_FIELDS} } } } }`, { q })
  return (d?.search?.nodes || []).filter((p) => p && p.number && p.headRefName === branch).map((p) => toCR(acc, p, acc.user))
}

/** 30 PR mới cập nhật nhất của repo "owner/name" (mọi trạng thái). */
async function byProject(acc, projectPath) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(projectPath)) return []
  const q = `is:pr repo:${projectPath} sort:updated-desc`
  const d = await gql(acc, `query($q: String!) { search(query: $q, type: ISSUE, first: 30) { nodes { ... on PullRequest { ${PR_FIELDS} } } } }`, { q })
  return (d?.search?.nodes || []).filter((p) => p && p.number).map((p) => toCR(acc, p, acc.user))
}

/** Nhánh của repo "owner/name": commit cuối, nhánh mặc định, có bảo vệ không. Tối đa 100 nhánh mới nhất. */
async function branches(acc, projectPath) {
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(projectPath)
  if (!m) return { defaultBranch: null, url: null, branches: [] }
  const d = await gql(acc, `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
    url defaultBranchRef { name }
    refs(refPrefix: "refs/heads/", first: 100, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) { nodes { name branchProtectionRule { id }
      target { ... on Commit { oid messageHeadline committedDate url author { name user { login } } } } } }
  } }`, { owner: m[1], name: m[2] })
  const r = d?.repository
  if (!r) throw new Error('Không tìm thấy repo')
  const def = r.defaultBranchRef?.name || null
  const list = (r.refs?.nodes || []).filter(Boolean).map((b) => ({
    name: b.name, isDefault: b.name === def, protected: !!b.branchProtectionRule, merged: null,
    commit: b.target?.oid ? { sha: b.target.oid.slice(0, 8), title: b.target.messageHeadline || '', author: b.target.author?.name || b.target.author?.user?.login || '', date: b.target.committedDate || '', url: b.target.url || null } : null,
  }))
  return { defaultBranch: def, url: r.url || null, branches: list }
}

const RUN = { SUCCESS: 'success', FAILURE: 'failed', TIMED_OUT: 'failed', STARTUP_FAILURE: 'failed', ACTION_REQUIRED: 'failed', CANCELLED: 'canceled', SKIPPED: 'none', NEUTRAL: 'success', STALE: 'none' }
function checkOf(n) {
  if (n.__typename === 'CheckRun') {
    if (n.status !== 'COMPLETED') return { name: n.name, status: n.status === 'IN_PROGRESS' ? 'running' : 'pending' }
    return { name: n.name, status: RUN[n.conclusion] || 'none' }
  }
  return { name: n.context, status: ROLLUP[n.state] || 'none' }
}

async function detail(acc, ref) {
  const [owner, name, number] = ref
  const d = await gql(acc, `query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) { pullRequest(number: $number) {
      ${PR_FIELDS} body
      latestOpinionatedReviews(first: 30) { nodes { state author { login ... on User { name } } } }
      reviewThreads(first: 100) { nodes { id isResolved isOutdated path line originalLine comments(first: 50) { nodes { author { login ... on User { name } } body createdAt url } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 50) { nodes { __typename ... on CheckRun { name status conclusion } ... on StatusContext { context state } } } } } } }
    } } }`, { owner, name, number })
  const p = d?.repository?.pullRequest
  if (!p) throw new Error('Không tìm thấy PR')
  const cr = toCR(acc, p, acc.user)
  const threads = (p.reviewThreads?.nodes || []).map((t) => ({
    id: t.id, resolved: t.isResolved, outdated: !!t.isOutdated, path: t.path || null, line: t.line ?? t.originalLine ?? null,
    comments: (t.comments?.nodes || []).map((c) => ({ author: person(c.author), body: String(c.body || ''), createdAt: c.createdAt, url: c.url })),
  }))
  const roll = p.commits?.nodes?.[0]?.commit?.statusCheckRollup
  return {
    ...cr, description: String(p.body || ''), threadList: threads,
    checks: (roll?.contexts?.nodes || []).filter(Boolean).map(checkOf),
    approvedBy: (p.latestOpinionatedReviews?.nodes || []).filter((r) => r.state === 'APPROVED').map((r) => person(r.author).name),
    mergeStatus: p.mergeable || '', pipelineUrl: null,
  }
}

const restBase = (acc) => acc.baseUrl === 'https://github.com' ? 'https://api.github.com' : acc.baseUrl + '/api/v3'
const rest = (acc, p, method = 'GET') => request(restBase(acc) + p, { method, headers: { authorization: 'Bearer ' + acc.token, accept: 'application/vnd.github+json' } })
function runStatus(status, conclusion) {
  if (status === 'completed') return RUN[String(conclusion || '').toUpperCase()] || 'none'
  return status === 'in_progress' ? 'running' : 'pending'
}
const secs = (a, b) => { const d = (Date.parse(b) - Date.parse(a)) / 1000; return Number.isFinite(d) && d >= 0 ? Math.round(d) : null }
const REPO_RE = /^([\w.-]+)\/([\w.-]+)$/

/** 30 workflow run mới nhất của repo "owner/name". */
async function pipelines(acc, projectPath) {
  const m = REPO_RE.exec(projectPath)
  if (!m) throw new Error('Tên repo không hợp lệ')
  const { data } = await rest(acc, `/repos/${m[1]}/${m[2]}/actions/runs?per_page=30`)
  return (data?.workflow_runs || []).map((r) => ({
    id: String(r.id), title: r.display_title || r.name || '', status: runStatus(r.status, r.conclusion), ref: r.head_branch || '', sha: String(r.head_sha || '').slice(0, 8),
    source: r.event || '', url: r.html_url || null, createdAt: r.created_at,
    durationSec: r.status === 'completed' ? secs(r.run_started_at || r.created_at, r.updated_at) : null,
  }))
}

/** Job của một workflow run (nhóm theo tên workflow). API này không trả log: mở link để xem. */
async function pipelineJobs(acc, projectPath, id) {
  const m = REPO_RE.exec(projectPath)
  if (!m) throw new Error('Tên repo không hợp lệ')
  const { data } = await rest(acc, `/repos/${m[1]}/${m[2]}/actions/runs/${id}/jobs?per_page=100`)
  return (data?.jobs || []).map((j) => ({
    id: String(j.id), name: j.name, stage: j.workflow_name || '', status: runStatus(j.status, j.conclusion),
    durationSec: j.status === 'completed' ? secs(j.started_at, j.completed_at) : null, url: j.html_url || null, allowFailure: false,
    reason: j.conclusion === 'failure' ? (j.steps || []).find((s) => s.conclusion === 'failure')?.name || '' : '', log: null,
  }))
}

/** Resolve / mở lại một review thread (id dạng node GraphQL). Cần quyền ghi PR. */
async function resolveThread(acc, ref, threadId, resolved) {
  const m = resolved ? 'resolveReviewThread' : 'unresolveReviewThread'
  await gql(acc, `mutation($id: ID!) { ${m}(input: { threadId: $id }) { thread { id } } }`, { id: threadId })
}
async function replyThread(acc, ref, threadId, body) {
  await gql(acc, 'mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $id, body: $body }) { comment { id } } }', { id: threadId, body })
}
async function prNodeId(acc, ref) {
  const [owner, name, number] = ref
  const d = await gql(acc, 'query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } } }', { owner, name, number })
  const id = d?.repository?.pullRequest?.id
  if (!id) throw new Error('Không tìm thấy PR')
  return id
}
/** Approve PR. Bỏ approve (dismiss review) cần lý do và quyền riêng, chưa hỗ trợ: dùng web. */
async function approve(acc, ref, on) {
  if (!on) throw new Error('GitHub: bỏ approve (dismiss review) chưa hỗ trợ trong app, dùng trang web')
  await gql(acc, 'mutation($id: ID!) { addPullRequestReview(input: { pullRequestId: $id, event: APPROVE }) { pullRequestReview { id } } }', { id: await prNodeId(acc, ref) })
}
/** Merge PR bằng merge commit (GitHub từ chối nếu nhánh bị bảo vệ chưa đủ điều kiện). */
async function merge(acc, ref) {
  await gql(acc, 'mutation($id: ID!) { mergePullRequest(input: { pullRequestId: $id, mergeMethod: MERGE }) { pullRequest { id } } }', { id: await prNodeId(acc, ref) })
}
async function createChangeRequest(acc, projectPath, { source, target, title, description }) {
  const m = REPO_RE.exec(projectPath)
  if (!m) throw new Error('Tên repo không hợp lệ')
  const r = await gql(acc, 'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }', { owner: m[1], name: m[2] })
  if (!r?.repository?.id) throw new Error('Không tìm thấy repo')
  const d = await gql(acc, 'mutation($repo: ID!, $base: String!, $head: String!, $title: String!, $body: String) { createPullRequest(input: { repositoryId: $repo, baseRefName: $base, headRefName: $head, title: $title, body: $body }) { pullRequest { url number } } }',
    { repo: r.repository.id, base: target, head: source, title, body: description })
  return { url: d?.createPullRequest?.pullRequest?.url || null, number: d?.createPullRequest?.pullRequest?.number ?? null }
}
/** Chạy lại các job lỗi của một workflow run. */
async function retryPipeline(acc, projectPath, id) {
  const m = REPO_RE.exec(projectPath)
  if (!m) throw new Error('Tên repo không hợp lệ')
  await rest(acc, `/repos/${m[1]}/${m[2]}/actions/runs/${id}/rerun-failed-jobs`, 'POST')
}

/** Khóa "accountId|owner/repo|number" → [owner, repo, number]; từ chối giá trị lạ. */
function parseKey(key) {
  const [, repo, num] = key.split('|')
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repo || '')
  if (!m || !/^\d+$/.test(num || '')) throw new Error('Khóa PR không hợp lệ')
  return [m[1], m[2], Number(num)]
}

module.exports = { whoami, repos, list, byBranch, byProject, branches, pipelines, pipelineJobs, detail, parseKey, resolveThread, replyThread, retryPipeline, approve, merge, createChangeRequest }
