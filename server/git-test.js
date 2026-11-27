// Kiểm thử phần git: parseStatus, kiểm tra tên, và tích hợp trên repo tạm.
// Chạy: node server/git-test.js   (không đụng tới data/ thật: dùng thư mục tạm)
const assert = require('assert')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devdeck-git-'))
const root = path.join(tmp, 'root')
const dataDir = path.join(tmp, 'data')
fs.mkdirSync(root); fs.mkdirSync(dataDir)
fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ roots: [root], depth: 3, recent: [] }))
process.env.DEVDECK_DATA = dataDir

const git = require('./git')
const actions = require('./git-actions')
const repos = require('./git-repos')

const G = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8', windowsHide: true }).trim()
const rejects = async (p, re, msg) => { try { await p } catch (e) { assert.match(e.message, re, msg); return } assert.fail('Phải lỗi: ' + msg) }
let n = 0
const test = async (name, fn) => { try { await fn(); n++; console.log('  ok  ' + name) } catch (e) { console.error('FAIL  ' + name + '\n', e); process.exitCode = 1 } }

;(async () => {
  console.log('parseStatus')
  await test('nhánh, upstream, ahead/behind, tệp', () => {
    const s = git.parseStatus([
      '# branch.oid abcdef1234567', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 a b src/a.ts', '1 .M N... 100644 100644 100644 a b src/b b.ts',
      '2 R. N... 100644 100644 100644 a b R100 new.ts\told.ts', 'u UU N... 1 1 1 1 a b c conflict.ts', '? new file.txt',
    ].join('\n'))
    assert.equal(s.branch, 'main'); assert.equal(s.upstream, 'origin/main'); assert.equal(s.ahead, 2); assert.equal(s.behind, 1)
    assert.equal(s.head, 'abcdef1')
    assert.deepEqual(s.files.map((f) => [f.path, f.kind]), [['src/a.ts', 'change'], ['src/b b.ts', 'change'], ['new.ts', 'change'], ['conflict.ts', 'conflict'], ['new file.txt', 'untracked']])
    assert.equal(s.files[0].x, 'M'); assert.equal(s.files[1].y, 'M')
  })
  await test('detached HEAD', () => {
    const s = git.parseStatus('# branch.oid 1234567890\n# branch.head (detached)')
    assert.equal(s.detached, true); assert.equal(s.branch, null)
  })

  console.log('kiểm tra tên / URL')
  await test('tên thư mục', () => {
    for (const bad of ['', '..', 'a/b', 'a\\b', 'con', 'NUL.txt', 'x.', '-rf', 'a:b', 'a*b', 'x'.repeat(101)]) assert.throws(() => repos.checkFolderName(bad), undefined, 'phải chặn: ' + bad)
    assert.equal(repos.checkFolderName(' my-app.v2 '), 'my-app.v2')
  })
  await test('URL clone chỉ nhận https / ssh / git@', () => {
    for (const ok of ['https://github.com/a/b.git', 'ssh://git@host/a/b.git', 'git@github.com:a/b.git']) assert.ok(repos.CLONE_URL.test(ok), ok)
    for (const bad of ['file:///etc', 'ext::sh -c id', '--upload-pack=x', 'http://a/b', '/tmp/x', 'https://a/b; rm -rf /', 'https://a/b c']) assert.ok(!repos.CLONE_URL.test(bad), bad)
    assert.equal(repos.nameFromUrl('git@github.com:a/b-c.git'), 'b-c'); assert.equal(repos.nameFromUrl('https://x/y/z/'), 'z')
  })

  console.log('tạo repo')
  let repo
  await test('createRepo (README + .gitignore, nhánh main)', async () => {
    const r = await repos.createRepo({ parent: root, name: 'demo', readme: true, gitignore: true })
    repo = r.path
    assert.ok(fs.existsSync(path.join(repo, '.git'))); assert.ok(fs.existsSync(path.join(repo, 'README.md'))); assert.ok(fs.existsSync(path.join(repo, '.gitignore')))
    assert.equal(G(repo, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.ok(git.repoPathsInfo().paths.some((p) => path.resolve(p) === path.resolve(repo)), 'phải xuất hiện trong danh sách quét')
  })
  await test('createRepo từ chối: thư mục đã có, ngoài gốc, tên xấu', async () => {
    await rejects(repos.createRepo({ parent: root, name: 'demo' }), /Đã có thư mục/, 'trùng tên')
    await rejects(repos.createRepo({ parent: os.tmpdir(), name: 'x' }), /thư mục quét/, 'ngoài gốc')
    await rejects(repos.createRepo({ parent: root, name: '../evil' }), /không hợp lệ/, 'tên xấu')
  })

  const run = (a, body) => actions.perform(repo, { action: a, ...body })
  G(repo, 'add', '-A'); G(repo, 'commit', '-m', 'init')

  console.log('nhánh')
  await test('createBranch từ điểm bắt đầu + chặn trùng / ref lạ', async () => {
    await run('createBranch', { name: 'feat/a', checkout: false })
    G(repo, 'switch', 'feat/a'); fs.writeFileSync(path.join(repo, 'a.txt'), 'a'); G(repo, 'add', '-A'); G(repo, 'commit', '-m', 'a'); G(repo, 'switch', 'main')
    await run('createBranch', { name: 'from-a', from: 'feat/a', checkout: false })
    assert.equal(G(repo, 'rev-parse', 'from-a'), G(repo, 'rev-parse', 'feat/a'))
    await rejects(run('createBranch', { name: 'from-a' }), /đã tồn tại/, 'trùng')
    await rejects(run('createBranch', { name: 'x', from: '--evil' }), /không hợp lệ/, 'from bắt đầu bằng -')
    await rejects(run('createBranch', { name: 'x', from: 'khong-co' }), /không hợp lệ/, 'from không có')
    await rejects(run('createBranch', { name: '-x' }), /không hợp lệ/, 'tên bắt đầu bằng -')
  })
  await test('checkout bị từ chối khi working tree có thay đổi', async () => {
    fs.appendFileSync(path.join(repo, 'README.md'), 'sửa\n')
    await rejects(run('checkout', { branch: 'feat/a' }), /chưa commit/, 'dirty')
    G(repo, 'checkout', '--', 'README.md')
    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'u')
    await run('checkout', { branch: 'feat/a' }); await run('checkout', { branch: 'main' })
    fs.rmSync(path.join(repo, 'untracked.txt'))
  })
  await test('renameBranch', async () => {
    await run('renameBranch', { from: 'from-a', to: 'renamed' })
    assert.ok(G(repo, 'branch', '--list', 'renamed')); assert.equal(G(repo, 'branch', '--list', 'from-a'), '')
    await rejects(run('renameBranch', { from: 'renamed', to: 'main' }), /Đã có nhánh/, 'trùng')
    await rejects(run('renameBranch', { from: 'ghost', to: 'z' }), /Không có nhánh/, 'không tồn tại')
  })
  await test('deleteBranch: dry-run, cần gõ tên, -d từ chối nhánh chưa merge, force xóa được', async () => {
    const d = await actions.perform(repo, { action: 'deleteBranch', branch: 'feat/a', dryRun: true })
    assert.equal(d.dryRun, true); assert.equal(d.info.merged, false); assert.equal(d.info.unmerged, 1)
    assert.ok(G(repo, 'branch', '--list', 'feat/a'), 'dry-run không được xóa')
    await rejects(run('deleteBranch', { branch: 'feat/a' }), /gõ đúng tên/, 'thiếu confirmName')
    await rejects(run('deleteBranch', { branch: 'feat/a', confirmName: 'feat/a' }), /not fully merged|chưa merge|-D/i, '-d với nhánh chưa merge')
    await run('deleteBranch', { branch: 'feat/a', confirmName: 'feat/a', force: true })
    assert.equal(G(repo, 'branch', '--list', 'feat/a'), '')
  })
  await test('deleteBranch chặn nhánh đang mở và nhánh mặc định', async () => {
    await rejects(run('deleteBranch', { branch: 'main', confirmName: 'main' }), /đang mở/, 'nhánh đang mở')
    G(repo, 'switch', '-c', 'other')
    await rejects(run('deleteBranch', { branch: 'main', confirmName: 'main' }), /mặc định/, 'nhánh mặc định')
    G(repo, 'switch', 'main')
  })
  await test('deleteBranch -d xóa được nhánh đã merge', async () => {
    await run('deleteBranch', { branch: 'other', confirmName: 'other' })
    assert.equal(G(repo, 'branch', '--list', 'other'), '')
  })
  await test('dry-run bị từ chối với hành động không hỗ trợ', async () => {
    await rejects(actions.perform(repo, { action: 'push', dryRun: true }), /dry-run/, 'push dry-run')
  })
  await test('hành động lạ bị từ chối', async () => {
    await rejects(run('constructor', {}), /không hỗ trợ/, 'prototype')
  })

  console.log('nhánh remote')
  await test('deleteRemoteBranch qua remote cục bộ', async () => {
    const bare = path.join(tmp, 'remote.git')
    G(tmp, 'init', '--bare', '-b', 'main', bare)
    G(repo, 'remote', 'add', 'origin', bare)
    G(repo, 'push', '-u', 'origin', 'main'); G(repo, 'branch', 'tmp1'); G(repo, 'push', 'origin', 'tmp1'); G(repo, 'fetch', 'origin')
    await rejects(run('deleteRemoteBranch', { ref: 'origin/main', confirmName: 'main' }), /mặc định/, 'nhánh mặc định remote')
    await rejects(run('deleteRemoteBranch', { ref: 'origin/tmp1' }), /gõ đúng tên/, 'thiếu confirmName')
    await rejects(run('deleteRemoteBranch', { ref: 'nope/tmp1', confirmName: 'tmp1' }), /remote/, 'remote lạ')
    const d = await actions.perform(repo, { action: 'deleteRemoteBranch', ref: 'origin/tmp1', dryRun: true })
    assert.equal(d.info.remote, 'origin'); assert.equal(d.info.branch, 'tmp1')
    await run('deleteRemoteBranch', { ref: 'origin/tmp1', confirmName: 'tmp1' })
    assert.equal(G(bare, 'branch', '--list', 'tmp1'), '')
  })

  console.log('clone')
  await test('clone lỗi thì báo lỗi và dọn thư mục dở', async () => {
    await assert.rejects(async () => repos.startClone({ url: 'ext::sh -c id', parent: root }), /URL phải/)
    await assert.rejects(async () => repos.startClone({ url: 'https://127.0.0.1:1/x.git', parent: os.tmpdir() }), /thư mục quét/)
    const j = repos.startClone({ url: 'https://127.0.0.1:1/x.git', parent: root })
    let s
    for (let i = 0; i < 100; i++) { s = repos.cloneStatus(j.id); if (s.status !== 'running') break; await new Promise((r) => setTimeout(r, 100)) }
    assert.equal(s.status, 'error'); assert.ok(s.error)
    assert.ok(!fs.existsSync(j.path), 'thư mục dở phải bị xóa')
  })
  await test('hủy clone', async () => {
    const j = repos.startClone({ url: 'https://10.255.255.1/x.git', parent: root, name: 'slow' })
    repos.cancelClone(j.id)
    let s
    for (let i = 0; i < 100; i++) { s = repos.cloneStatus(j.id); if (s.status !== 'running') break; await new Promise((r) => setTimeout(r, 100)) }
    assert.equal(s.status, 'cancelled'); assert.ok(!fs.existsSync(j.path))
  })

  console.log('xóa repo')
  await test('deleteRepo: dry-run, cần gõ tên, chặn ngoài gốc', async () => {
    fs.writeFileSync(path.join(repo, 'dirty.txt'), 'x')
    const d = await repos.deleteRepo({ path: repo, dryRun: true })
    assert.equal(d.info.dirty, 1); assert.equal(d.info.name, 'demo'); assert.ok(fs.existsSync(repo))
    await rejects(repos.deleteRepo({ path: repo, confirmName: 'sai' }), /gõ đúng tên/, 'sai tên')
    await rejects(repos.deleteRepo({ path: tmp }), /không nằm trong danh sách/, 'đường dẫn lạ')
    assert.ok(fs.existsSync(repo))
  })
  await test('deleteRepo chuyển vào Thùng rác (bỏ qua nếu máy không có)', async () => {
    const r = await repos.createRepo({ parent: root, name: 'to-trash' })
    try { await repos.deleteRepo({ path: r.path, confirmName: 'to-trash' }) } catch (e) {
      if (/Thùng rác/.test(e.message)) { console.log('       (bỏ qua: ' + e.message + ')'); fs.rmSync(r.path, { recursive: true, force: true }); return }
      throw e
    }
    assert.ok(!fs.existsSync(r.path))
  })

  console.log('audit')
  await test('audit.log ghi hành động, không ghi confirmName', () => {
    const lines = fs.readFileSync(path.join(dataDir, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    assert.ok(lines.some((l) => l.action === 'deleteBranch' && l.ok)); assert.ok(lines.some((l) => l.action === 'createRepo'))
    assert.ok(!lines.some((l) => l.params && 'confirmName' in l.params && l.params.confirmName !== undefined))
    assert.ok(!lines.some((l) => l.params?.dryRun), 'dry-run không được ghi')
  })

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`\n${n} kiểm thử qua${process.exitCode ? ', CÓ LỖI' : ''}`)
})()
