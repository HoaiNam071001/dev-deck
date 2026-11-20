import { useState } from 'react'
import { api, useLoad } from '../api'
import { Modal } from './Modal'
import { Icon, Spinner } from './ui'

/** Duyệt thư mục trên máy chạy server để chọn thư mục quét. */
export function FolderPicker({ start, selected, recent = [], onToggle, onClose }: { start: string; selected: string[]; recent?: string[]; onToggle: (path: string) => void; onClose: () => void }) {
  const [dir, setDir] = useState(start)
  const [typed, setTyped] = useState(start)
  const { data, error, loading } = useLoad(() => api.browse(dir), [dir])

  const go = (p: string) => { setDir(p); setTyped(p) }
  const here = data?.path ?? ''

  return (
    <Modal onClose={onClose} titleId="picker-title" header={<h2 id="picker-title">Chọn thư mục quét</h2>}>
      <div className="picker">
        {recent.length > 0 && (
          <div className="recent-row">
            Gần đây:
            {recent.map((r) => (
              <button key={r} type="button" className={selected.includes(r) ? 'on' : ''} aria-pressed={selected.includes(r)} title={r} onClick={() => onToggle(r)}>
                <span className="truncate block">{r}</span>
              </button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); go(typed.trim()) }}>
          <button type="button" className="btn" disabled={!data || data.parent === null} onClick={() => data && go(data.parent ?? '')} title="Lên thư mục cha">↑ Lên</button>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Đường dẫn" placeholder="Nhập đường dẫn rồi Enter" spellCheck={false} />
          <button type="submit" className="btn">Đi tới</button>
          {data && <button type="button" className="btn" onClick={() => go(data.home)} title="Thư mục người dùng">Home</button>}
        </form>

        {error && <div className="text-danger">{error}</div>}
        {loading && !data && <Spinner label="Đang đọc…" />}
        {data && (
          <ul className="picker-list">
            {data.dirs.map((d) => (
              <li key={d.path}>
                <button onClick={() => go(d.path)}><Icon name="folder" size={13} />{d.name}{d.isRepo && <span className="tag">git</span>}</button>
              </li>
            ))}
            {!data.dirs.length && <li className="empty">Không có thư mục con</li>}
          </ul>
        )}

        <div className="picker-foot">
          <span className="muted truncate" title={here}>{here ? `Đang xem: ${here}` : 'Chọn một ổ đĩa'}</span>
          <button className="btn" disabled={!here} onClick={() => onToggle(here)}>{selected.includes(here) ? 'Bỏ thư mục này' : 'Thêm thư mục này'}</button>
          <button className="btn primary" onClick={onClose}>Xong ({selected.length})</button>
        </div>
      </div>
    </Modal>
  )
}
