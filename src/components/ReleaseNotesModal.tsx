import { useEffect, useState } from 'react'
import { notesToShow, RELEASE_NOTES, type NoteTag, type ReleaseNote } from '../releaseNotes'
import { Modal } from './Modal'
import { Chip } from './ui'

const SEEN_KEY = 'releaseNotes.seen'
const TAG: Record<NoteTag, { tone: 'ok' | 'info' | 'behind'; label: string }> = {
  new: { tone: 'ok', label: 'Mới' }, improve: { tone: 'info', label: 'Cải thiện' }, fix: { tone: 'behind', label: 'Sửa lỗi' },
}
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) } catch { return null } }
const writeSeen = (v: string) => { try { localStorage.setItem(SEEN_KEY, v) } catch { /* bỏ qua */ } }

function Notes({ list }: { list: ReleaseNote[] }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-5">
      {list.map((n) => (
        <section key={n.version} aria-label={'Phiên bản ' + n.version}>
          <div className="flex items-baseline gap-2.5">
            <h3 className="text-[15px] font-semibold">v{n.version}</h3>
            <span className="text-[12px] text-fg-mute">{n.date}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-fg-soft">{n.title}</div>
          <ul className="mt-2.5 flex flex-col gap-2">
            {n.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                <span className="mt-0.5 w-[68px] flex-none"><Chip tone={TAG[it.tag].tone}>{TAG[it.tag].label}</Chip></span>
                <span className="min-w-0 flex-1 font-normal text-fg-soft">{it.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * Modal "Có gì mới": tự mở một lần khi chạy phiên bản mới (các bản từ lần xem trước đến nay),
 * và mở lại được bằng cách bấm số phiên bản ở thanh trạng thái.
 */
export function ReleaseNotesModal({ version, openSignal }: { version: string; openSignal: number }) {
  const [list, setList] = useState<ReleaseNote[] | null>(null)

  // Tự mở khi bản này chưa được xem; đánh dấu đã xem ngay để không lặp lại nếu app bị đóng đột ngột
  useEffect(() => {
    const auto = notesToShow(version, readSeen())
    if (auto.length) setList(auto)
    writeSeen(version)
  }, [version])

  // Mở thủ công: bản hiện tại (hoặc bản mới nhất không vượt quá nó); không có thì hiện toàn bộ
  useEffect(() => {
    if (!openSignal) return
    const cur = RELEASE_NOTES.filter((n) => n.version === version)
    setList(cur.length ? cur : RELEASE_NOTES.slice(0, 3))
  }, [openSignal, version])

  if (!list) return null
  return (
    <Modal onClose={() => setList(null)} titleId="rn-title" header={<h2 id="rn-title">Có gì mới trong DevDeck</h2>}>
      {/* Chân modal dính đáy: nội dung ngắn thì không để khoảng trống bên dưới nút */}
      <div className="flex min-h-full flex-col">
        <Notes list={list} />
        <div className="sticky bottom-0 flex items-center justify-end border-t border-border bg-surface px-5 py-3">
          <button className="btn primary" onClick={() => setList(null)}>Đã hiểu</button>
        </div>
      </div>
    </Modal>
  )
}
