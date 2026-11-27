// Ghép URL remote của repo local (origin...) với account GitLab / GitHub đã thêm.

/** "https://host/a/b.git", "git@host:a/b.git", "ssh://git@host:22/a/b.git" → { host, path:"a/b" } hoặc null. */
function parseRemoteUrl(raw) {
  const s = String(raw || '').trim()
  let host, path
  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/.exec(s)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    let u
    try { u = new URL(s) } catch { return null }
    if (!/^(https?|ssh|git)(\+ssh)?:$/.test(u.protocol)) return null
    host = u.hostname
    path = decodeURIComponent(u.pathname)
  } else if (scp) { host = scp[1]; path = scp[2] } else return null
  path = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '')
  if (!host || !/^[\w.-]+(\/[\w.-]+)+$/.test(path)) return null
  return { host: host.toLowerCase(), path }
}

/** Tên project trên account nếu remote thuộc host của account; bỏ phần đường dẫn gốc của baseUrl (GitLab đặt dưới /gitlab). */
function projectOn(acc, remote) {
  let b
  try { b = new URL(acc.baseUrl) } catch { return null }
  if (b.hostname.toLowerCase() !== remote.host) return null
  const prefix = b.pathname.replace(/^\/+|\/+$/g, '')
  let path = remote.path
  if (prefix) { if (!path.startsWith(prefix + '/')) return null; path = path.slice(prefix.length + 1) }
  return path.includes('/') ? path : null
}

module.exports = { parseRemoteUrl, projectOn }
