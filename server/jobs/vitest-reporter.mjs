// Reporter vitest (>= 3) ghi tiến độ từng file test ra ~/.devdeck/progress/<pid>.json để tab Job của DevDeck hiển thị.
// Dùng cùng reporter mặc định:  vitest run --reporter=default --reporter=<đường dẫn file này>
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DIR = path.join(os.homedir(), '.devdeck', 'progress')
const FILE = path.join(DIR, process.pid + '.json')

export default class DevDeckReporter {
  constructor() { this.files = new Map(); this.finished = false; this.root = process.cwd(); this.startedAt = Date.now() }

  onInit(ctx) { this.root = ctx?.config?.root || this.root }

  onTestRunStart(specifications) {
    this.files = new Map(); this.finished = false; this.startedAt = Date.now()
    for (const s of specifications || []) this.set(s.moduleId ?? s.file, 'queued')
    this.write()
  }

  onTestModuleQueued(m) { if (!this.files.has(m.moduleId)) this.set(m.moduleId, 'queued'); this.write() }
  onTestModuleStart(m) { this.set(m.moduleId, 'running'); this.write() }
  onTestModuleEnd(m) {
    const st = m.state()
    this.set(m.moduleId, st === 'failed' ? 'fail' : st === 'skipped' ? 'skip' : 'pass', m.diagnostic?.()?.duration)
    this.write()
  }
  onTestRunEnd() { this.finished = true; this.write() }

  set(id, state, ms) {
    if (!id) return
    this.files.set(id, { file: path.relative(this.root, id).replace(/\\/g, '/'), state, ms: ms ? Math.round(ms) : undefined })
  }

  write() {
    try {
      fs.mkdirSync(DIR, { recursive: true })
      const tmp = FILE + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify({ runner: 'vitest', pid: process.pid, root: this.root, startedAt: this.startedAt, updatedAt: Date.now(), finished: this.finished, files: [...this.files.values()] }))
      fs.renameSync(tmp, FILE)
    } catch { /* không để lỗi ghi file làm hỏng lần chạy test */ }
  }
}
