const fs = require('fs')
const os = require('os')
const path = require('path')

/** Thư mục cấu hình Claude Code mặc định (tài khoản "mặc định"). */
const DEFAULT_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const FILE = path.join(process.env.DEVDECK_DATA || path.join(__dirname, '..', '..', 'data'), 'claude-accounts.json')

const norm = (d) => path.resolve(String(d || '').trim())

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return [...new Set((Array.isArray(j.dirs) ? j.dirs : []).filter((d) => typeof d === 'string').map(norm))].filter((d) => d !== norm(DEFAULT_DIR))
  } catch { return [] }
}

function save(dirs) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify({ dirs }, null, 2))
}

/** Chỉ nhận thư mục tồn tại và trông giống thư mục cấu hình Claude Code (đã từng đăng nhập hoặc có log). */
function validate(dir) {
  if (!dir || !path.isAbsolute(String(dir).trim())) throw new Error('Cần đường dẫn tuyệt đối')
  const d = norm(dir)
  let st
  try { st = fs.statSync(d) } catch { throw new Error('Thư mục không tồn tại') }
  if (!st.isDirectory()) throw new Error('Đây không phải thư mục')
  const ok = ['.credentials.json', '.claude.json', 'projects'].some((f) => fs.existsSync(path.join(d, f)))
  if (!ok) throw new Error('Chưa thấy dữ liệu Claude Code trong thư mục này. Hãy chạy claude với CLAUDE_CONFIG_DIR trỏ tới đây và /login trước')
  return d
}

/** Hồ sơ hiển thị (email, tổ chức) của một thư mục. Thư mục mặc định có thể nằm ở ~/.claude.json. */
function profileOf(dir) {
  const files = dir === DEFAULT_DIR && !process.env.CLAUDE_CONFIG_DIR
    ? [path.join(os.homedir(), '.claude.json'), path.join(dir, '.claude.json')]
    : [path.join(dir, '.claude.json')]
  for (const f of files) {
    try {
      const a = JSON.parse(fs.readFileSync(f, 'utf8')).oauthAccount
      if (a) return { email: a.emailAddress || null, org: a.organizationName || null }
    } catch { /* thử file tiếp */ }
  }
  return { email: null, org: null }
}

/** '' = mặc định. Trả về thư mục thật nếu hợp lệ (đã đăng ký), ngược lại ném lỗi. */
function resolve(dir) {
  if (!dir) return DEFAULT_DIR
  const d = norm(dir)
  if (!load().includes(d)) throw new Error('Tài khoản chưa được thêm')
  return d
}

function list() {
  return [DEFAULT_DIR, ...load()].map((d) => ({ dir: d === DEFAULT_DIR ? '' : d, path: d, ...profileOf(d) }))
}

function add(dir) {
  const d = validate(dir)
  if (d !== norm(DEFAULT_DIR)) save([...new Set([...load(), d])])
  return list()
}

function remove(dir) {
  const d = norm(dir)
  save(load().filter((x) => x !== d))
  return list()
}

module.exports = { DEFAULT_DIR, list, add, remove, resolve, profileOf, dirs: () => [DEFAULT_DIR, ...load()] }
