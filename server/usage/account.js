const fs = require('fs')
const path = require('path')
const profiles = require('./profiles')

const URL_USAGE = 'https://api.anthropic.com/api/oauth/usage'
const TTL = 60_000

const cache = new Map() // theo thư mục cấu hình

/** Đọc token OAuth của một thư mục Claude Code. Token chỉ nằm trong bộ nhớ server, không bao giờ trả ra ngoài. */
function readToken(dir) {
  let j
  try { j = JSON.parse(fs.readFileSync(path.join(dir, '.credentials.json'), 'utf8')) } catch { return { error: 'no-credentials' } }
  const o = j && j.claudeAiOauth
  if (!o || !o.accessToken) return { error: 'no-credentials' }
  if (o.expiresAt && o.expiresAt < Date.now()) return { error: 'expired' }
  return { token: o.accessToken, plan: o.subscriptionType || null }
}

const win = (w) => (w && typeof w.utilization === 'number' ? { pct: w.utilization, resetsAt: w.resets_at || null } : null)

/** % hạn mức thật của một tài khoản Claude (giống màn hình Account & Usage). `account` = '' là mặc định. Cache 60s. Lỗi trả { error }. */
async function claudeAccount(account = '') {
  const dir = profiles.resolve(account)
  const hit = cache.get(dir)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const t = readToken(dir)
  let value
  if (t.error) value = { error: t.error, ...profiles.profileOf(dir) }
  else {
    try {
      const res = await fetch(URL_USAGE, {
        headers: { authorization: 'Bearer ' + t.token, 'anthropic-beta': 'oauth-2025-04-20', 'user-agent': 'devdeck-usage' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) value = { error: res.status === 401 ? 'expired' : 'http-' + res.status, ...profiles.profileOf(dir) }
      else {
        const d = await res.json()
        value = { plan: t.plan, ...profiles.profileOf(dir), five: win(d.five_hour), week: win(d.seven_day), fetchedAt: new Date().toISOString() }
        if (!value.five && !value.week) value = { error: 'bad-shape', ...profiles.profileOf(dir) }
      }
    } catch { value = { error: 'network', ...profiles.profileOf(dir) } }
  }
  cache.set(dir, { at: Date.now(), value })
  return value
}

module.exports = { claudeAccount }
