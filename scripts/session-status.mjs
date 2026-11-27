// Hook SessionStart của Claude Code: in bảng trạng thái plan + git status ngắn để phiên mới khỏi mở lại plan/README.md.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = []

try {
  const plan = readFileSync(join(root, 'plan', 'README.md'), 'utf8')
  const rows = plan.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l))
  out.push('## Trạng thái plan (plan/README.md)')
  for (const r of rows) {
    const [, num, name, , status] = r.split('|').map((s) => s.trim())
    out.push(`- ${num}. ${name} — ${status}`)
  }
} catch { out.push('(không đọc được plan/README.md)') }

try {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim()
  out.push('', `## Git: nhánh ${git('branch', '--show-current')}`)
  const st = git('status', '--short')
  out.push(st ? st.split('\n').slice(0, 30).join('\n') : '(sạch)')
  out.push('', 'Commit gần nhất:', git('log', '--oneline', '-5'))
} catch { /* không phải repo git */ }

console.log(out.join('\n'))
