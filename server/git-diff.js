// Đọc diff của một tệp và tách thành hunk. Hàm thuần (parseDiff, buildPatch) tách riêng để test.
// Ghi (stage từng hunk) nằm ở git-actions.js và chỉ nhận { file, hash }, không nhận patch từ giao diện.
const { execFile } = require('child_process')
const crypto = require('crypto')

const MAX_DIFF = 500 * 1024
const STASH_REF = /^stash@\{\d{1,4}\}$/

function gitOut(cwd, args, okCodes = [0]) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=off', ...args], {
      cwd, timeout: 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'buffer',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout, stderr) => {
      const code = err ? err.code : 0
      if (err && !okCodes.includes(code)) return reject(new Error(stderr.toString('utf8').trim() || err.message))
      resolve(stdout)
    })
  })
}

const hashOf = (header, lines) => crypto.createHash('sha1').update(header + '\n' + lines.join('\n')).digest('hex').slice(0, 12)

/** Tách đầu ra `git diff` của MỘT tệp thành { head, hunks, binary }. head = các dòng trước hunk đầu tiên. */
function parseDiff(text) {
  const rows = text.split('\n')
  if (rows.length && rows[rows.length - 1] === '') rows.pop()
  const head = []
  const hunks = []
  let cur = null
  for (const row of rows) {
    if (row.startsWith('@@ ')) {
      cur = { header: row, lines: [] }
      hunks.push(cur)
    } else if (cur) cur.lines.push(row)
    else head.push(row)
  }
  for (const h of hunks) h.hash = hashOf(h.header, h.lines)
  const binary = !hunks.length && head.some((l) => /^Binary files .* differ$|^GIT binary patch/.test(l))
  return { head, hunks, binary }
}

/** Dựng patch chỉ gồm một hunk, từ đúng các dòng git đã in (giữ nguyên \r nếu tệp CRLF). */
function buildPatch(head, hunk) {
  return [...head, hunk.header, ...hunk.lines].join('\n') + '\n'
}

/** kind: 'unstaged' | 'staged' | 'untracked' | 'stash' (stash cần ref). */
async function diffArgs(cwd, kind, file, ref) {
  const base = ['diff', '--no-color', '--no-ext-diff', '--no-renames', '-U3']
  if (kind === 'staged') return { args: [...base, '--cached', '--', file] }
  if (kind === 'unstaged') return { args: [...base, '--', file] }
  if (kind === 'untracked') return { args: [...base, '--no-index', '--', '/dev/null', file], okCodes: [0, 1] }
  if (kind === 'stash') {
    if (!STASH_REF.test(ref || '')) throw new Error('Tham chiếu stash không hợp lệ')
    return { args: [...base, ref + '^1', ref, '--', file] }
  }
  throw new Error('Loại diff không hợp lệ')
}

function checkFile(file) {
  if (typeof file !== 'string' || !file || file.startsWith('-') || /^([a-zA-Z]:|[\\/])/.test(file) || file.split(/[\\/]/).includes('..')) throw new Error('Đường dẫn tệp không hợp lệ')
  return file
}

/** Diff một tệp, đã tách hunk. Quá lớn hoặc nhị phân thì không trả nội dung. */
async function fileDiff(cwd, { file, kind = 'unstaged', ref }) {
  checkFile(file)
  const { args, okCodes } = await diffArgs(cwd, kind, file, ref)
  const buf = await gitOut(cwd, args, okCodes)
  if (buf.length > MAX_DIFF) return { file, kind, binary: false, tooLarge: true, size: buf.length, head: [], hunks: [] }
  const text = buf.toString('utf8')
  const d = parseDiff(text)
  return { file, kind, binary: d.binary, tooLarge: false, size: buf.length, head: d.head, hunks: d.hunks, nonUtf8: text.includes('�') }
}

/** Các tệp và số dòng đổi của một stash. */
async function stashFiles(cwd, ref) {
  if (!STASH_REF.test(ref || '')) throw new Error('Tham chiếu stash không hợp lệ')
  const out = (await gitOut(cwd, ['stash', 'show', '--numstat', '--no-renames', ref])).toString('utf8')
  return out.split('\n').filter(Boolean).map((l) => {
    const x = l.split('\t')
    return { path: x.slice(2).join('\t'), add: x[0] === '-' ? 0 : +x[0], del: x[1] === '-' ? 0 : +x[1] }
  })
}

module.exports = { STASH_REF, MAX_DIFF, parseDiff, buildPatch, fileDiff, stashFiles, checkFile }
