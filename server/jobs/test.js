// Kiểm thử phần đọc tiến trình macOS / Linux (dữ liệu mẫu từ ps / lsof, không phụ thuộc máy chạy)
const assert = require('assert')
const { _test: t } = require('./procs-unix')

assert.strictEqual(t.parseCpuTime('0:12.50'), 125000000)
assert.strictEqual(t.parseCpuTime('1:02:03'), (3600 + 120 + 3) * 1e7)
assert.strictEqual(t.parseCpuTime('2-01:00:00'), (49 * 3600) * 1e7)
assert.strictEqual(t.parseCpuTime('???'), 0)

const stat = t.parseStat('  501   1  20480   0:01.25 Thu Nov 27 19:43:15 2026\n 9001 501 512000 1:00:00 Fri Nov  7 08:00:01 2025\nrác\n')
assert.deepStrictEqual(stat.map((p) => [p.pid, p.ppid, p.mem, p.cpu]), [[501, 1, 20480 * 1024, 12500000], [9001, 501, 512000 * 1024, 36000000000]])
assert.ok(/^\d{4}-\d\d-\d\dT/.test(stat[0].start), 'start là ISO')

const names = t.parsePidText(' 501 /usr/local/bin/node\n 502 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome Helper\n')
assert.strictEqual(t.baseName(names.get(501)), 'node')
assert.strictEqual(t.baseName(names.get(502)), 'Google Chrome Helper')

const l = t.parseLsof('p501\nfcwd\nn/Users/bob/app\np777\nf20\nn*:5173\nn[::1]:5173\nn127.0.0.1:3000\n')
assert.deepStrictEqual(l.get(501), ['/Users/bob/app'])
assert.deepStrictEqual(l.get(777).map(t.parseListenAddr), [{ port: 5173, host: '0.0.0.0' }, { port: 5173, host: '[::1]' }, { port: 3000, host: '127.0.0.1' }])
console.log('ok jobs unix')
