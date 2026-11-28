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
