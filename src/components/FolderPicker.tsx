import { useState } from 'react'
import { api, useLoad } from '../api'
import { Modal, Spinner } from './Modal'

/** Duyệt thư mục trên máy chạy server để chọn thư mục quét. */
export function FolderPicker({ start, selected, onToggle, onClose }: { start: string; selected: string[]; onToggle: (path: string) => void; onClose: () => void }) {
  const [dir, setDir] = useState(start)
  const [typed, setTyped] = useState(start)
  const { data, error, loading } = useLoad(() => api.browse(dir), [dir])

  const go = (p: string) => { setDir(p); setTyped(p) }
  const here = data?.path ?? ''

  return (
    <Modal onClose={onClose} titleId="picker-title" header={<h2 id="picker-title">Chọn thư mục quét</h2>}>
      <div className="picker">
        <form className="actions" onSubmit={(e) => { e.preventDefault(); go(typed.trim()) }}>
          <button type="button" disabled={!data || data.parent === null} onClick={() => data && go(data.parent ?? '')} title="Lên thư mục cha">↑ Lên</button>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Đường dẫn" placeholder="Nhập đường dẫn rồi Enter" spellCheck={false} />
          <button type="submit">Đi tới</button>
          {data && <button type="button" onClick={() => go(data.home)} title="Thư mục người dùng">🏠</button>}
        </form>

        {error && <div className="error-text pad">{error}</div>}
        {loading && !data && <Spinner label="Đang đọc…" />}
        {data && (
          <ul className="picker-list">
            {data.dirs.map((d) => (
              <li key={d.path}>
                <button onClick={() => go(d.path)}>📁 {d.name}{d.isRepo && <span className="tag">git</span>}</button>
              </li>
            ))}
            {!data.dirs.length && <li className="muted pad">Không có thư mục con</li>}
          </ul>
        )}

        <div className="picker-foot">
          <span className="muted truncate" title={here}>{here ? `Đang xem: ${here}` : 'Chọn một ổ đĩa'}</span>
          <button disabled={!here} onClick={() => onToggle(here)}>{selected.includes(here) ? 'Bỏ thư mục này' : 'Thêm thư mục này'}</button>
          <button className="primary" onClick={onClose}>Xong ({selected.length})</button>
        </div>
      </div>
    </Modal>
  )
}
