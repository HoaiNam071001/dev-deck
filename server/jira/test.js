const assert = require('assert')
const { extractKeys, adfText, normalize } = require('./client')

assert.deepStrictEqual(extractKeys('feature/ABC-123-fix UTF-8 ISO-8601 DEV-9', new Set(['ABC', 'DEV'])), ['ABC-123', 'DEV-9'])
assert.deepStrictEqual(extractKeys('UTF-8 ABC-1', null), ['UTF-8', 'ABC-1'])
assert.strictEqual(adfText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Xin' }, { type: 'hardBreak' }, { type: 'text', text: 'chào' }] }] }).trim(), 'Xin\nchào')
const acc = { baseUrl: 'https://x.atlassian.net' }
const n = normalize(acc, { key: 'ABC-1', fields: { summary: 's', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }, assignee: { displayName: 'A' }, customfield_10020: [{ name: 'S1', state: 'closed' }, { name: 'S2', state: 'active' }], description: 'plain' } })
assert.strictEqual(n.category, 'doing'); assert.strictEqual(n.sprint, 'S2'); assert.strictEqual(n.url, 'https://x.atlassian.net/browse/ABC-1'); assert.strictEqual(n.description, 'plain')
assert.ok(!JSON.stringify(n).includes('token'))
console.log('jira: ok')

// Fetch giả: Cloud (v3 + Basic, ADF) và Data Center (v2 + Bearer)
;(async () => {
  const os = require('os'); const fs = require('fs'); const path = require('path')
  process.env.DEVDECK_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-'))
  const jira = require('./index')
  const calls = []
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: init.headers.authorization })
    const u = new URL(url)
    const body = u.pathname.endsWith('/myself') ? { displayName: 'Tôi' }
      : u.pathname.endsWith('/project') ? [{ key: 'ABC' }]
      : { issues: [{ key: 'ABC-1', fields: { summary: 's', status: { name: 'Done', statusCategory: { key: 'done' } },
          description: u.pathname.includes('/api/3/') ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'adf' }] }] } : 'plain' } }] }
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => JSON.stringify(body) }
  }
  const cloud = await jira.addAccount({ baseUrl: 'https://x.atlassian.net', email: 'a@b.c', token: 'secrettoken' })
  assert.strictEqual(cloud.kind, 'cloud'); assert.ok(!JSON.stringify(cloud).includes('secrettoken'))
  assert.ok(calls[0].url.includes('/rest/api/3/myself') && calls[0].auth.startsWith('Basic '))
  const r = await jira.issues({ keys: ['ABC-1', 'ZZZ-9', 'bad'] })
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].description, 'adf'); assert.strictEqual(r[0].category, 'done')
  assert.ok(calls.at(-1).url.includes('/rest/api/3/search/jql?'))
  assert.ok(decodeURIComponent(calls.at(-1).url.replace(/\+/g, ' ')).includes('key in (ABC-1)'))
  for (const a of jira.accounts()) jira.removeAccount(a.id)
  const dc = await jira.addAccount({ baseUrl: 'https://jira.corp.com', token: 'pat123456' })
  assert.strictEqual(dc.kind, 'server')
  assert.ok(calls.at(-1).url.includes('/rest/api/2/myself') && calls.at(-1).auth === 'Bearer pat123456')
  assert.strictEqual((await jira.issues({ keys: ['ABC-1'] }))[0].description, 'plain')
  assert.ok(calls.at(-1).url.includes('/rest/api/2/search?'))
  // 13c: ghi
  const { rich } = require('./client')
  assert.deepStrictEqual(rich({ kind: 'server' }, 'a\nb'), 'a\nb')
  assert.strictEqual(rich({ kind: 'cloud' }, 'a\n\nb').content.length, 2)
  const acc2 = jira.accounts()[0]
  const writes = []
  const base = global.fetch
  global.fetch = async (url, init) => { if (init.method === 'POST') writes.push({ url: String(url), body: init.body }); const u = new URL(url); if (u.pathname.endsWith('/transitions') && init.method === 'GET') return { ok: true, status: 200, statusText: '', headers: new Headers(), text: async () => JSON.stringify({ transitions: [{ id: '31', name: 'Review', to: { name: 'In Review' } }] }) }; return base(url, init) }
  await assert.rejects(jira.act({ action: 'comment', key: 'ABC-1', account: acc2.id, body: 'hi' }), /chỉ đọc/)
  assert.strictEqual(writes.length, 0)
  jira.setWrite(acc2.id, true)
  assert.deepStrictEqual(await jira.transitionsOf({ key: 'ABC-1', account: acc2.id }), [{ id: '31', name: 'Review', to: 'In Review' }])
  await jira.act({ action: 'transition', key: 'ABC-1', account: acc2.id, transitionId: '31' })
  await jira.act({ action: 'comment', key: 'ABC-1', account: acc2.id, body: 'bí mật' })
  await jira.act({ action: 'worklog', key: 'ABC-1', account: acc2.id, seconds: 1800 })
  assert.strictEqual(writes.length, 3)
  assert.strictEqual(JSON.parse(writes[1].body).body, 'bí mật') // Data Center: chữ thuần
  assert.strictEqual(JSON.parse(writes[2].body).timeSpentSeconds, 1800)
  await assert.rejects(jira.act({ action: 'worklog', key: 'ABC-1', account: acc2.id, seconds: 5 }), /Thời gian/)
  await assert.rejects(jira.act({ action: 'transition', key: 'ZZZ-1', account: acc2.id, transitionId: '1' }), /không thuộc/)
  const log = fs.readFileSync(path.join(process.env.DEVDECK_DATA, 'audit.log'), 'utf8')
  assert.ok(!log.includes('bí mật') && log.includes('jira.comment'))
  // theo dõi người / JQL
  assert.strictEqual(require('./client').jqlOfUser({}, 'ab"c\\d'), 'assignee = "abcd" AND statusCategory != Done ORDER BY updated DESC')
  assert.throws(() => jira.follow({ account: acc2.id, userId: 'u9', events: [] }), /ít nhất một/)
  const f = jira.follow({ account: acc2.id, userId: 'u1', label: 'An', events: ['status', 'comment'] }).follow
  assert.deepStrictEqual(f.events, ['status', 'comment'])
  await assert.rejects(async () => jira.follow({ account: acc2.id, userId: 'u1', label: 'An' }), /Đã theo dõi/)
  await assert.rejects(async () => jira.follow({ account: acc2.id, jql: '  ' }), /JQL/)
  const wn = await jira.whatsNew()
  assert.ok(wn.items.some((x) => x.issue.key === 'ABC-1' && x.via.includes('An')))
  assert.strictEqual(wn.follows.length, 1)
  assert.deepStrictEqual(jira.follow({ action: 'remove', id: f.id }).follows, [])
  // seen: chỉ ghi mốc khi updated khớp lúc người dùng nhìn thấy
  const seenSpy = []
  const w0 = require('./watch'); const orig = w0.markSeen; w0.markSeen = (l) => seenSpy.push(...l.map((i) => i.key))
  const cur = (await jira.whatsNew()).items[0]
  assert.ok(cur); {
    await jira.seen({ marks: { [cur.issue.key]: 'cũ' } }); assert.deepStrictEqual(seenSpy, [])
    await jira.seen({ marks: { [cur.issue.key]: cur.issue.updated } }); assert.deepStrictEqual(seenSpy, [cur.issue.key])
  }
  w0.markSeen = orig
  // ghim + mốc: ghim sai bị từ chối; lần đầu thấy ticket không có sự kiện, lần sau có
  const watch = require('./watch')
  assert.throws(() => jira.pin({ key: 'abc', on: true }), /không hợp lệ/)
  assert.deepStrictEqual(jira.pin({ key: 'ABC-7', on: true }).pinned, ['ABC-7'])
  assert.deepStrictEqual(jira.pin({ key: 'ABC-7', on: false }).pinned, [])
  const t1 = { key: 'T-1', status: 'To Do', assignee: 'A', priority: 'High', sprint: '', comments: [] }
  assert.deepStrictEqual(watch.compare([t1])[0].events, [])
  assert.strictEqual(watch.compare([{ ...t1, status: 'Done' }])[0].events[0].text, 'To Do → Done')
  watch.markSeen([{ ...t1, status: 'Done' }])
  assert.deepStrictEqual(watch.compare([{ ...t1, status: 'Done' }])[0].events, [])
  console.log('jira fetch: ok')
})().catch((e) => { console.error(e); process.exit(1) })

;(() => {
  const { diff, snapshot } = require('./watch')
  const mk = (o) => ({ status: 'To Do', assignee: 'A', priority: 'High', sprint: 'S1', comments: [], ...o })
  const base = mk({ comments: [{ id: '1', author: 'B', mine: false, body: 'x' }] })
  const prev = snapshot(base)
  assert.deepStrictEqual(diff(prev, base), [])
  const now = mk({ status: 'In Review', assignee: 'C', comments: [base.comments[0], { id: '2', author: 'B', mine: false, body: 'đã sửa xong\nxem lại' }, { id: '3', author: 'Tôi', mine: true, body: 'ok' }] })
  const ev = diff(prev, now)
  assert.deepStrictEqual(ev.map((e) => e.kind), ['status', 'assignee', 'comment'])
  assert.strictEqual(ev[0].text, 'To Do → In Review'); assert.ok(ev[2].text.startsWith('B: “đã sửa xong”'))
  // ticket chưa có comment trước đó: comment đầu tiên của người khác vẫn được báo
  assert.strictEqual(diff(snapshot(mk()), mk({ comments: [{ id: '9', author: 'B', mine: false, body: 'hi' }] })).length, 1)
  console.log('jira watch: ok')
})()

;(() => {
  const { estimate } = require('./worktime')
  assert.deepStrictEqual(estimate([]), { seconds: 0, commits: 0, sessions: 0 })
  assert.deepStrictEqual(estimate([1000]), { seconds: 1800, commits: 1, sessions: 1 })
  // hai commit cách 1 giờ cùng phiên: 30' + 60' = 90' → 1h30
  assert.strictEqual(estimate([0, 3600]).seconds, 5400)
  // cách 5 giờ = hai phiên: 30' + 30' = 1h
  const two = estimate([0, 5 * 3600]); assert.strictEqual(two.sessions, 2); assert.strictEqual(two.seconds, 3600)
  assert.strictEqual(estimate([0, 100, 100, NaN]).commits, 2) // trùng / lỗi bị bỏ
  assert.strictEqual(estimate(Array.from({ length: 200 }, (_, i) => i * 3600)).seconds, 86400) // chặn 24 giờ
  console.log('jira worktime: ok')
})()
