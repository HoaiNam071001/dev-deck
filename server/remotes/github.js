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
  reviewThreads(first: 100) { nodes { isResolved } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`

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
  }
}

const SAFE_LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$/

async function list(acc, { scope, state }) {
  const me = acc.user
  if (!SAFE_LOGIN.test(me)) throw new Error('Tên đăng nhập GitHub không hợp lệ')
  const who = scope === 'review' ? `review-requested:${me}` : scope === 'assigned' ? `assignee:${me}` : `author:${me}`
  const st = state === 'merged' ? 'is:merged' : state === 'closed' ? 'is:closed -is:merged' : 'is:open'
  const q = `is:pr ${st} ${who} archived:false sort:updated-desc`
  const d = await gql(acc, `query($q: String!) { search(query: $q, type: ISSUE, first: 40) { nodes { ... on PullRequest { ${PR_FIELDS} } } } }`, { q })
  return (d?.search?.nodes || []).filter((p) => p && p.number).map((p) => toCR(acc, p, me))
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

/** Khóa "accountId|owner/repo|number" → [owner, repo, number]; từ chối giá trị lạ. */
function parseKey(key) {
  const [, repo, num] = key.split('|')
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repo || '')
  if (!m || !/^\d+$/.test(num || '')) throw new Error('Khóa PR không hợp lệ')
  return [m[1], m[2], Number(num)]
}

module.exports = { whoami, list, detail, parseKey }
