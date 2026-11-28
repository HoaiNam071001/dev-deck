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
  assert.ok(decodeURIComponent(calls.at(-1).url.replace(/\+/g, ' ')).includes('key in (ABC-1)'))
  assert.deepStrictEqual(await jira.extract({ texts: ['feat/ABC-1 UTF-8'] }), [['ABC-1']])
  for (const a of jira.accounts()) jira.removeAccount(a.id)
  const dc = await jira.addAccount({ baseUrl: 'https://jira.corp.com', token: 'pat123456' })
  assert.strictEqual(dc.kind, 'server')
  assert.ok(calls.at(-1).url.includes('/rest/api/2/myself') && calls.at(-1).auth === 'Bearer pat123456')
  assert.strictEqual((await jira.issues({ keys: ['ABC-1'] }))[0].description, 'plain')
  console.log('jira fetch: ok')
})().catch((e) => { console.error(e); process.exit(1) })
