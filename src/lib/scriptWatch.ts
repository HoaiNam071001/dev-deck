import { useEffect } from 'react'
import { api } from '../api'
import { systemNotify } from './platform'
import { toast } from './store'

const EVERY_MS = 3000
const LONG_MS = 20_000 // chỉ báo job chạy đủ lâu (build / test); lệnh ngắn không báo

/** Báo khi script chạy từ app kết thúc. Mount một lần ở App. */
export function useScriptDoneWatch() {
  useEffect(() => {
    const running = new Map<string, boolean>()
    let first = true
    let stop = false
    const poll = async () => {
      try {
        const runs = await api.scriptRuns()
        if (stop) return
        for (const r of runs) {
          const was = running.get(r.id)
          running.set(r.id, r.running)
          if (first || was !== true || r.running || !r.end) continue
          if (new Date(r.end).getTime() - new Date(r.start).getTime() < LONG_MS) continue
          const name = (r.rel ? r.rel + ' · ' : '') + r.script
          const ok = r.code === 0
          systemNotify(ok ? 'Script xong' : 'Script lỗi', name + (ok ? '' : ' (mã ' + r.code + ')'), 'git')
          toast({ kind: ok ? 'ok' : 'err', title: (ok ? 'Xong: ' : 'Lỗi: ') + name, detail: ok ? undefined : 'mã thoát ' + r.code })
        }
        first = false
      } catch { /* thử lại nhịp sau */ }
    }
    void poll()
    const t = setInterval(() => void poll(), EVERY_MS)
    return () => { stop = true; clearInterval(t) }
  }, [])
}
