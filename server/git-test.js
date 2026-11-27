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

  console.log('stash')
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' })
  const diffLib = require('./git-diff')
  const w = (rel, text) => fs.writeFileSync(path.join(repo, rel), text)
  const detail = () => git.repoDetail(repo)
  fs.rmSync(path.join(repo, 'dirty.txt'), { force: true })
  await test('parseStashList đọc ref, thông điệp, nhánh', () => {
    const l = git.parseStashList(['stash@{0}\x1fOn main: việc dở\x1f2026-01-02T03:04:05+00:00', 'stash@{1}\x1fWIP on feat/x: abc123 subject\x1f2026-01-01T00:00:00+00:00', 'stash@{2}\x1fcustom\x1f'].join('\n'))
    assert.deepEqual(l.map((s) => [s.ref, s.message, s.branch]), [['stash@{0}', 'việc dở', 'main'], ['stash@{1}', 'abc123 subject', 'feat/x'], ['stash@{2}', 'custom', null]])
  })
  await test('stash: cất, liệt kê, apply giữ lại, pop xóa', async () => {
    await rejects(run('stash', {}), /Không có thay đổi/, 'sạch thì không stash')
    w('README.md', 'đổi 1\n'); w('new-untracked.txt', 'u\n')
    await run('stash', { message: 'việc dở 1' })
    assert.equal(G(repo, 'status', '--porcelain', '--untracked-files=no'), ''); assert.ok(fs.existsSync(path.join(repo, 'new-untracked.txt')), 'không có -u thì giữ tệp untracked')
    let s = (await detail()).stashes
    assert.equal(s.length, 1); assert.equal(s[0].ref, 'stash@{0}'); assert.equal(s[0].message, 'việc dở 1'); assert.equal(s[0].branch, 'main')
    assert.deepEqual((await diffLib.stashFiles(repo, 'stash@{0}')).map((f) => f.path), ['README.md'])
    await run('stashApply', { ref: 'stash@{0}' })
    assert.match(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), /đổi 1/); assert.equal((await detail()).stashes.length, 1, 'apply giữ stash')
    G(repo, 'checkout', '--', 'README.md')
    await run('stashPop', { ref: 'stash@{0}' })
    assert.equal((await detail()).stashes.length, 0, 'pop xóa stash')
    G(repo, 'checkout', '--', 'README.md'); fs.rmSync(path.join(repo, 'new-untracked.txt'))
  })
  await test('stash --include-untracked', async () => {
    w('only-untracked.txt', 'u\n')
    await rejects(run('stash', {}), /Không có thay đổi/, 'untracked không tính nếu không có -u')
    await run('stash', { message: 'có untracked', includeUntracked: true })
    assert.ok(!fs.existsSync(path.join(repo, 'only-untracked.txt')))
    await run('stashPop', { ref: 'stash@{0}' }); assert.ok(fs.existsSync(path.join(repo, 'only-untracked.txt')))
    fs.rmSync(path.join(repo, 'only-untracked.txt'))
  })
  await test('stash pop có xung đột: báo rõ và giữ stash', async () => {
    w('README.md', 'bản stash\n'); await run('stash', { message: 'xung đột' })
    w('README.md', 'bản khác\n'); G(repo, 'commit', '-am', 'đổi README')
    await rejects(run('stashPop', { ref: 'stash@{0}' }), /Xung đột.*giữ lại/s, 'conflict')
    assert.equal((await detail()).stashes.length, 1, 'stash còn nguyên')
    G(repo, 'reset', '--hard', '-q')
  })
  await test('stash drop cần xác nhận; ref sai bị chặn', async () => {
    await rejects(run('stashDrop', { ref: 'stash@{0}' }), /xác nhận/, 'thiếu confirm')
    for (const bad of ['stash@{0};rm', '--all', 'HEAD', 'stash@{x}', 'stash@{99}']) await rejects(run('stashDrop', { ref: bad, confirm: true }), /stash|Không còn/i, 'ref xấu: ' + bad)
    await run('stashDrop', { ref: 'stash@{0}', confirm: true }); assert.equal((await detail()).stashes.length, 0)
  })
  await test('checkout kèm stash khi đang bẩn', async () => {
    G(repo, 'branch', 'side'); w('README.md', 'dở dang\n')
    await rejects(run('checkout', { branch: 'side' }), /chưa commit/, 'không stash thì bị chặn')
    await run('checkout', { branch: 'side', stash: true })
    assert.equal(G(repo, 'symbolic-ref', '--short', 'HEAD'), 'side'); assert.equal((await detail()).stashes.length, 1)
    await run('checkout', { branch: 'main' }); await run('stashPop', { ref: 'stash@{0}' }); G(repo, 'checkout', '--', 'README.md')
  })

  console.log('diff / hunk')
  const manyLines = (f) => Array.from({ length: 40 }, (_, i) => f(i)).join('\n') + '\n'
  await test('parseDiff tách hunk, hash ổn định, nhận diện nhị phân', () => {
    const text = 'diff --git a/f b/f\nindex 1..2 100644\n--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n@@ -20 +20 @@\n-x\n+y\n'
    const d = diffLib.parseDiff(text)
    assert.equal(d.head.length, 4); assert.equal(d.hunks.length, 2); assert.deepEqual(d.hunks[0].lines, [' a', '-b', '+c'])
    assert.match(d.hunks[0].hash, /^[0-9a-f]{12}$/); assert.notEqual(d.hunks[0].hash, d.hunks[1].hash)
    assert.equal(diffLib.parseDiff(text).hunks[1].hash, d.hunks[1].hash)
    assert.equal(diffLib.parseDiff('diff --git a/i b/i\nBinary files a/i and b/i differ\n').binary, true)
    assert.equal(diffLib.buildPatch(d.head, d.hunks[1]), d.head.join('\n') + '\n@@ -20 +20 @@\n-x\n+y\n')
  })
  await test('stage / bỏ stage một hunk trong tệp có 2 hunk', async () => {
    w('big.txt', manyLines((i) => 'dòng ' + i)); G(repo, 'add', 'big.txt'); G(repo, 'commit', '-m', 'big')
    w('big.txt', manyLines((i) => (i === 2 ? 'ĐỔI đầu' : i === 35 ? 'ĐỔI cuối' : 'dòng ' + i)))
    const d = await diffLib.fileDiff(repo, { file: 'big.txt', kind: 'unstaged' })
    assert.equal(d.hunks.length, 2)
    await run('stageHunk', { file: 'big.txt', hash: d.hunks[1].hash })
    const cached = G(repo, 'diff', '--cached', 'big.txt')
    assert.ok(cached.includes('ĐỔI cuối') && !cached.includes('ĐỔI đầu'), 'chỉ hunk cuối được stage')
    assert.ok(G(repo, 'diff', 'big.txt').includes('ĐỔI đầu'), 'hunk đầu vẫn chưa stage')
    const s = await diffLib.fileDiff(repo, { file: 'big.txt', kind: 'staged' })
    await run('unstageHunk', { file: 'big.txt', hash: s.hunks[0].hash })
    assert.equal(G(repo, 'diff', '--cached', 'big.txt'), '')
    assert.ok(fs.readFileSync(path.join(repo, 'big.txt'), 'utf8').includes('ĐỔI cuối'), 'tệp làm việc không bị đụng')
  })
  await test('hash lệch (tệp đã đổi) bị từ chối; đầu vào xấu bị chặn', async () => {
    const d = await diffLib.fileDiff(repo, { file: 'big.txt', kind: 'unstaged' })
    w('big.txt', manyLines((i) => (i === 2 ? 'ĐỔI khác' : i === 35 ? 'ĐỔI cuối' : 'dòng ' + i)))
    await rejects(run('stageHunk', { file: 'big.txt', hash: d.hunks[0].hash }), /đã thay đổi/, 'hash cũ')
    await rejects(run('stageHunk', { file: 'big.txt', hash: 'zz' }), /Mã hunk/, 'hash xấu')
    await rejects(run('stageHunk', { file: '../x', hash: d.hunks[0].hash }), /không hợp lệ/, 'đường dẫn xấu')
    await rejects(run('stageHunk', { file: '--all', hash: d.hunks[0].hash }), /không hợp lệ/, 'tên tệp kiểu cờ')
    await rejects(run('stageHunk', { file: 'big.txt', hash: d.hunks[0].hash, patch: 'diff --git x' }), /đã thay đổi/, 'patch tùy ý bị bỏ qua')
    G(repo, 'checkout', '--', 'big.txt')
  })
  await test('hunk với tệp CRLF', async () => {
    G(repo, 'config', 'core.autocrlf', 'false')
    w('crlf.txt', manyLines((i) => 'dòng ' + i).replace(/\n/g, '\r\n')); G(repo, 'add', 'crlf.txt'); G(repo, 'commit', '-m', 'crlf')
    w('crlf.txt', manyLines((i) => (i === 1 ? 'MỚI a' : i === 38 ? 'MỚI b' : 'dòng ' + i)).replace(/\n/g, '\r\n'))
    const d = await diffLib.fileDiff(repo, { file: 'crlf.txt', kind: 'unstaged' })
    assert.equal(d.hunks.length, 2)
    await run('stageHunk', { file: 'crlf.txt', hash: d.hunks[0].hash })
    const cached = execFileSync('git', ['diff', '--cached', 'crlf.txt'], { cwd: repo, encoding: 'utf8' })
    assert.ok(cached.includes('MỚI a') && !cached.includes('MỚI b')); assert.ok(cached.includes('\r\n'), 'giữ CRLF')
    G(repo, 'reset', '-q'); G(repo, 'checkout', '--', 'crlf.txt')
  })
  await test('diff tệp untracked, nhị phân, quá lớn, stash', async () => {
    w('u.txt', 'a\nb\n')
    const u = await diffLib.fileDiff(repo, { file: 'u.txt', kind: 'untracked' })
    assert.equal(u.hunks.length, 1); assert.ok(u.hunks[0].lines.includes('+a'))
    fs.writeFileSync(path.join(repo, 'bin.dat'), Buffer.from([0, 1, 2, 0, 255, 0])); G(repo, 'add', 'bin.dat'); G(repo, 'commit', '-m', 'bin')
    fs.writeFileSync(path.join(repo, 'bin.dat'), Buffer.from([0, 9, 9, 0, 255, 0, 7]))
    assert.equal((await diffLib.fileDiff(repo, { file: 'bin.dat', kind: 'unstaged' })).binary, true)
    await rejects(run('stageHunk', { file: 'bin.dat', hash: '0'.repeat(12) }), /nhị phân|đã thay đổi/, 'nhị phân không stage hunk')
    G(repo, 'checkout', '--', 'bin.dat')
    w('huge.txt', 'x\n'); G(repo, 'add', 'huge.txt'); G(repo, 'commit', '-m', 'huge')
    w('huge.txt', 'y'.repeat(600 * 1024) + '\n')
    const h = await diffLib.fileDiff(repo, { file: 'huge.txt', kind: 'unstaged' })
    assert.equal(h.tooLarge, true); assert.equal(h.hunks.length, 0)
    G(repo, 'checkout', '--', 'huge.txt')
    w('README.md', 'stash diff\n'); await run('stash', { message: 'để xem diff' })
    const sd = await diffLib.fileDiff(repo, { file: 'README.md', kind: 'stash', ref: 'stash@{0}' })
    assert.ok(sd.hunks[0].lines.includes('+stash diff'))
    await assert.rejects(diffLib.fileDiff(repo, { file: 'README.md', kind: 'stash', ref: '--oops' }), /không hợp lệ/)
    await run('stashDrop', { ref: 'stash@{0}', confirm: true }); fs.rmSync(path.join(repo, 'u.txt'))
  })

  console.log('worktree')
  await test('parseWorktrees đọc nhánh, detached, locked, prunable', () => {
    const w = git.parseWorktrees('worktree C:/a/main\nHEAD abcdef1234\nbranch refs/heads/main\n\nworktree C:/a/wt\nHEAD 1234567890\ndetached\nlocked lý do\nprunable gone\n')
    assert.equal(w.length, 2); assert.equal(w[0].main, true); assert.equal(w[0].branch, 'main'); assert.equal(w[0].head, 'abcdef1')
    assert.equal(w[1].main, false); assert.equal(w[1].detached, true); assert.equal(w[1].locked, true); assert.equal(w[1].prunable, true); assert.equal(w[1].branch, null)
  })
  let wt
  await test('worktreeAdd: nhánh mới, thư mục mặc định, gom vào repo chính khi quét', async () => {
    const before = (await git.listRepos(true)).repos.length
    await run('worktreeAdd', { branch: 'feat/wt', create: true })
    wt = path.join(path.resolve(repo) + '-wt', 'feat-wt')
    assert.ok(fs.existsSync(path.join(wt, '.git')), 'có .git dạng tệp'); assert.ok(fs.statSync(path.join(wt, '.git')).isFile())
    assert.equal(G(wt, 'symbolic-ref', '--short', 'HEAD'), 'feat/wt')
    const list = await git.listRepos(true)
    assert.equal(list.repos.length, before, 'worktree không thành repo riêng')
    assert.equal(list.repos.find((r) => path.resolve(r.path) === path.resolve(repo)).worktrees, 1)
    const d = await detail()
    assert.deepEqual(d.worktrees.map((x) => [x.main, x.branch, x.dirty]), [[true, 'main', 0], [false, 'feat/wt', 0]])
    assert.equal(git.knownRepo(wt), wt, 'worktree được phép mở bằng VS Code / Terminal')
    assert.equal(git.repoPathsInfo().worktrees.length, 1)
  })
  await test('worktreeAdd từ chối: nhánh có sẵn đang dùng, thư mục không trống, ngoài thư mục quét, trong repo, tên xấu', async () => {
    await rejects(run('worktreeAdd', { branch: 'feat/wt', create: true }), /đã tồn tại/, 'tạo trùng nhánh')
    await rejects(run('worktreeAdd', { branch: 'feat/wt', dir: path.join(root, 'x-wt', 'again') }), /already|checked out|used by worktree/i, 'nhánh đang ở worktree khác')
    fs.mkdirSync(path.join(root, 'busy')); fs.writeFileSync(path.join(root, 'busy', 'f'), 'x')
    await rejects(run('worktreeAdd', { branch: 'n1', create: true, dir: path.join(root, 'busy') }), /không trống/, 'thư mục có tệp')
    await rejects(run('worktreeAdd', { branch: 'n2', create: true, dir: path.join(tmp, 'outside') }), /thư mục quét/, 'ngoài gốc')
    await rejects(run('worktreeAdd', { branch: 'n3', create: true, dir: path.join(repo, 'inside') }), /bên trong chính repo/, 'trong repo')
    await rejects(run('worktreeAdd', { branch: '-x', create: true }), /không hợp lệ/, 'tên bắt đầu bằng -')
    await rejects(run('worktreeAdd', { branch: 'ghost' }), /Không có nhánh local/, 'nhánh không tồn tại')
    assert.equal(G(repo, 'branch', '--list', 'n1'), '', 'không tạo nhánh khi thất bại')
  })
  await test('worktreeAdd dùng nhánh có sẵn', async () => {
    G(repo, 'branch', 'existing')
    await run('worktreeAdd', { branch: 'existing' })
    assert.ok(fs.existsSync(path.join(path.resolve(repo) + '-wt', 'existing', '.git')))
  })
  await test('worktreeRemove: dry-run, cần gõ tên, chặn khi bẩn trừ khi force, không xóa nhánh', async () => {
    const d = await actions.perform(repo, { action: 'worktreeRemove', dir: wt, dryRun: true })
    assert.equal(d.info.dirty, 0); assert.equal(d.info.branch, 'feat/wt'); assert.ok(fs.existsSync(wt))
    fs.writeFileSync(path.join(wt, 'dirty.txt'), 'x')
    assert.equal((await actions.perform(repo, { action: 'worktreeRemove', dir: wt, dryRun: true })).info.dirty, 1)
    await rejects(run('worktreeRemove', { dir: wt }), /gõ đúng tên/, 'thiếu tên')
    await rejects(run('worktreeRemove', { dir: wt, confirmName: 'feat-wt' }), /chưa commit/, 'bẩn không force')
    assert.ok(fs.existsSync(wt))
    await run('worktreeRemove', { dir: wt, confirmName: 'feat-wt', force: true })
    assert.ok(!fs.existsSync(wt)); assert.ok(G(repo, 'branch', '--list', 'feat/wt'), 'nhánh còn nguyên')
    assert.equal((await detail()).worktrees.length, 2)
  })
  await test('worktreeRemove: sạch thì xóa được; chặn worktree chính và đường dẫn lạ', async () => {
    const ex = path.join(path.resolve(repo) + '-wt', 'existing')
    await run('worktreeRemove', { dir: ex, confirmName: 'existing' }); assert.ok(!fs.existsSync(ex))
    await rejects(run('worktreeRemove', { dir: repo, confirmName: path.basename(repo) }), /chính/, 'worktree chính')
    await rejects(run('worktreeRemove', { dir: tmp, confirmName: path.basename(tmp) }), /Không phải worktree/, 'đường dẫn lạ')
    assert.equal((await detail()).worktrees.length, 1)
  })
  await test('worktreePrune dọn worktree có thư mục đã bị xóa tay', async () => {
    await run('worktreeAdd', { branch: 'gone', create: true })
    const dir = path.join(path.resolve(repo) + '-wt', 'gone'); fs.rmSync(dir, { recursive: true, force: true })
    const d = await detail(); assert.equal(d.worktrees.find((x) => x.branch === 'gone')?.prunable, true)
    await rejects(run('worktreeRemove', { dir, confirmName: 'gone' }), /prune/, 'remove thư mục đã mất')
    await run('worktreePrune', {}); assert.equal((await detail()).worktrees.length, 1)
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
