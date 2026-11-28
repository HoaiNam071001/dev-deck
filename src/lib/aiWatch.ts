import { useEffect } from 'react'
import { api } from '../api'
import { doneMessage } from './aiNotify'
import { systemNotify } from './platform'
import { navigate } from './router'
import { toast } from './store'

const EVERY_MS = 4000

/** Hỏi server các lượt AI vừa xong và báo (server đã lọc theo công tắc, nguồn, thư mục, ngưỡng thời gian). Mount một lần ở App. */
export function useAiDoneWatch() {
  useEffect(() => {
    let last: number | null = null
    let stop = false
    const poll = async () => {
      try {
        // Lần đầu chỉ lấy mốc hiện tại để không báo lại việc cũ khi mở / tải lại cửa sổ
        const r = await api.aiDone(last === null ? Number.MAX_SAFE_INTEGER : last)
        if (stop) return
        const first = last === null
        last = r.last // server khởi động lại thì mã sự kiện về 0, lấy theo server
        if (first || !r.events.length) return
        const m = doneMessage(r.events)
        systemNotify(m.title, m.body, 'ai')
        toast({ kind: 'ok', title: m.title, detail: m.body, onOpen: () => navigate('/ai') })
      } catch { /* server chưa sẵn sàng: thử lại nhịp sau */ }
    }
    void poll()
    const t = setInterval(() => void poll(), EVERY_MS)
    return () => { stop = true; clearInterval(t) }
  }, [])
}
