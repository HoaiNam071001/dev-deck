// Gọi HTTP tới GitLab / GitHub: có timeout, giới hạn song song, cache ngắn hạn.
const TIMEOUT = 20000

/** Chuẩn hóa base URL người dùng nhập: chỉ http(s), bỏ dấu / cuối, bỏ phần /api nếu lỡ dán vào. */
function cleanBase(input) {
  let u
  try { u = new URL(String(input).trim()) } catch { throw new Error('URL không hợp lệ') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('URL phải bắt đầu bằng http:// hoặc https://')
  if (u.username || u.password) throw new Error('URL không được chứa user:password')
  return (u.origin + u.pathname).replace(/\/+$/, '').replace(/\/api(\/v\d+|\/graphql)?$/, '')
}

async function request(url, { method = 'GET', headers = {}, body } = {}) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT)
  try {
    const res = await fetch(url, { method, headers: { accept: 'application/json', 'user-agent': 'DevDeck', ...headers }, body, signal: ctl.signal })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { /* không phải JSON */ }
    if (!res.ok) {
      const msg = (data && (data.message || data.error || (Array.isArray(data.errors) && data.errors[0]?.message))) || text.slice(0, 160) || res.statusText
      const err = new Error(`HTTP ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`)
      err.status = res.status
      throw err
    }
    return { data, text, headers: res.headers }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Hết thời gian chờ khi gọi ' + new URL(url).host)
    if (e.status) throw e
    throw new Error('Không kết nối được ' + new URL(url).host + ': ' + (e.cause?.code || e.message))
  } finally { clearTimeout(t) }
}

/** Chạy `fn` cho từng phần tử, tối đa `n` việc cùng lúc, giữ nguyên thứ tự kết quả. */
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

const cache = new Map()
/** Cache theo khóa trong `ttl` ms; lỗi không được cache. */
async function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.v
  const v = await fn()
  cache.set(key, { at: Date.now(), v })
  if (cache.size > 500) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k)
  return v
}
const dropCache = (prefix) => { for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k) }

module.exports = { cleanBase, request, pool, cached, dropCache }
