const path = require('path')
const os = require('os')
const { walk, jsonLines, num, base } = require('./util')

const ROOT = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions')

/**
 * Rollout: dòng `session_meta` (cwd), `turn_context` (model), `event_msg` kiểu `token_count`
 * với `info.last_token_usage`. Codex phát lại cùng một token_count nhiều lần nên chỉ lấy
 * khi `total_token_usage.total_tokens` tăng. `input_tokens` đã gồm phần cache đọc → trừ ra.
 */
function parse(text, file) {
  const rows = []
  let project = 'unknown'
  let projectPath = ''
  let model = 'unknown'
  let branch
  let lastTotal = -1
  let n = 0
  for (const o of jsonLines(text)) {
    const p = o.payload
    if (!p) continue
    if (o.type === 'session_meta' && p.cwd) { project = base(p.cwd); projectPath = p.cwd }
    if (o.type === 'session_meta' && p.git && typeof p.git.branch === 'string' && p.git.branch && p.git.branch !== 'HEAD') branch = p.git.branch
    if (o.type === 'turn_context') {
      if (p.model) model = p.model
      if (p.cwd && project === 'unknown') { project = base(p.cwd); projectPath = p.cwd }
    } else if (o.type === 'event_msg' && p.type === 'token_count' && p.info && o.timestamp) {
      const total = p.info.total_token_usage && p.info.total_token_usage.total_tokens
      if (typeof total === 'number') { if (total <= lastTotal) continue; lastTotal = total }
      const u = p.info.last_token_usage
      if (!u) continue
      const cached = num(u.cached_input_tokens)
      rows.push({
        id: `${file}#${n++}`,
        t: o.timestamp,
        ...(branch && { branch }),
        session: path.basename(file, '.jsonl'),
        project,
        projectPath,
        model,
        input: Math.max(0, num(u.input_tokens) - cached),
        output: num(u.output_tokens),
        cacheWrite: 0,
        cacheRead: cached,
        reasoning: num(u.reasoning_output_tokens),
      })
    }
  }
  return rows
}

/** `task_complete`, hoặc lời đáp cuối của agent không kèm lệnh đang chạy; trả về dòng đó làm chữ ký, '' nếu chưa xong. Bỏ qua token_count / turn_context. */
function isDone(tail) {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let o
    try { o = JSON.parse(lines[i]) } catch { continue }
    const p = o.payload
    if (!p) continue
    if (o.type === 'event_msg') {
      if (p.type === 'token_count') continue
      return p.type === 'task_complete' || p.type === 'agent_message' ? lines[i] : ''
    }
    if (o.type === 'turn_context') continue
    return o.type === 'response_item' && p.type === 'message' && p.role === 'assistant' ? lines[i] : ''
  }
  return ''
}

module.exports = {
  id: 'codex',
  label: 'Codex',
  root: ROOT,
  files: () => walk(ROOT, ['.jsonl']),
  parse,
  isDone,
}
