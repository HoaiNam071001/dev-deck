import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { effective, normPath, setPath, SOURCE_LABEL } from '../lib/aiNotify'
import { bridge } from '../lib/platform'
import { toast } from '../lib/store'
import type { AiNotifyConfig, AiNotifyState } from '../types'
import { Modal } from './Modal'
import { Chip, ErrorBanner, Spinner } from './ui'

const isAbs = (p: string) => /^([a-zA-Z]:[\\/]|\/|\\\\)/.test(p)

/** Bật / tắt thông báo "AI chạy xong": chung, theo nguồn, theo repo / thư mục (mặc định bật tất cả) và hook Stop của Claude. */
export function AiNotifyPanel({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<AiNotifyState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [newPath, setNewPath] = useState('')
  const [confirmHook, setConfirmHook] = useState<'install' | 'uninstall' | null>(null)

  useEffect(() => { api.aiNotify().then(setSt).catch((e: Error) => setErr(e.message)) }, [])

  const run = async (fn: () => Promise<AiNotifyState>, okTitle?: string) => {
    setBusy(true); setErr(null)
    try { setSt(await fn()); if (okTitle) toast({ kind: 'ok', title: okTitle }) } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const save = (patch: Partial<AiNotifyConfig>) => st && run(() => api.aiNotifySave({ ...st.config, ...patch }))

  const rows = useMemo(() => {
    if (!st) return []
    const known = new Set(st.projects.map((p) => normPath(p.path)))
    // Quy tắc trỏ tới thư mục chưa có trong log vẫn hiện để sửa / xóa được
    const extra = st.config.rules.filter((r) => !known.has(normPath(r.path))).map((r) => ({ path: r.path, name: r.path.split(/[\\/]/).filter(Boolean).pop() ?? r.path, providers: [] as string[], last: '' }))
    const needle = q.trim().toLowerCase()
    return [...extra, ...st.projects].filter((p) => !needle || p.path.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle))
  }, [st, q])

  const addRule = (on: boolean) => {
    const p = newPath.trim()
    if (!st) return
    if (!isAbs(p)) { setErr('Cần đường dẫn tuyệt đối, ví dụ /Users/ban/work hoặc C:\\work'); return }
    setNewPath('')
    void save({ rules: setPath(st.config.rules, p, on) })
  }

  const cfg = st?.config
  const hookLabel = (h: AiNotifyState['hooks'][number]) => (h.error ? 'Lỗi settings.json' : h.installed ? (h.stale ? 'Đã cài, lệch cổng: cần cài lại' : 'Đã cài') : 'Chưa cài')

  return (
    <Modal onClose={onClose} titleId="ainotify-title" header={<h2 id="ainotify-title">Thông báo khi AI chạy xong</h2>}>
      <div className="flex flex-col gap-4 p-4 text-[12px]">
        {err && <ErrorBanner onRetry={() => void run(api.aiNotify)}>{err}</ErrorBanner>}
        {!st && !err && <Spinner label="Đang tải…" />}
        {cfg && st && <>
          <section className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-fg-soft">
              <input type="checkbox" checked={cfg.enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })} />
              Báo khi một lượt hỏi của AI chạy xong (chỉ báo khi cửa sổ DevDeck không được xem)
            </label>
            <label className="flex items-center gap-2 text-fg-soft">
              Chỉ báo nếu chạy lâu hơn
              <input type="number" min={0} max={3600} className="w-16 font-mono" defaultValue={cfg.minSeconds} key={cfg.minSeconds} disabled={busy}
                onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (Number.isInteger(v) && v >= 0 && v <= 3600 && v !== cfg.minSeconds) void save({ minSeconds: v }); else e.target.value = String(cfg.minSeconds) }} />
              giây
            </label>
            <div className="flex flex-wrap items-center gap-3 text-fg-soft">
              <span className="text-fg-mute">Nguồn:</span>
              {Object.keys(SOURCE_LABEL).map((s) => (
                <label key={s} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={cfg.sources[s] !== false} disabled={busy} onChange={(e) => void save({ sources: { ...cfg.sources, [s]: e.target.checked } })} />{SOURCE_LABEL[s]}
                </label>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-medium text-fg">Claude: báo chính xác bằng hook Stop</h3>
            <p className="leading-relaxed text-fg-mute">Không cài hook thì DevDeck đoán qua log (log ngừng đổi {cfg.debounceSeconds} giây). Cài hook thì Claude Code tự báo ngay khi dừng. Nút dưới sửa <span className="font-mono">settings.json</span> của từng tài khoản Claude, giữ nguyên hook của bạn và sao lưu bản gốc thành <span className="font-mono">settings.json.devdeck-bak</span>.</p>
            {st.hooks.map((h) => (
              <div key={h.path} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono" title={h.path}>{h.path}</span>
                <Chip tone={h.error ? 'danger' : h.installed && !h.stale ? 'ok' : h.installed ? 'behind' : 'muted'} title={h.error || undefined}>{hookLabel(h)}</Chip>
              </div>
            ))}
            {confirmHook ? (
              <div className="flex items-center gap-2">
                <span className="text-fg-soft">{confirmHook === 'install' ? 'Sẽ ghi hook Stop vào settings.json của các tài khoản trên.' : 'Sẽ gỡ hook Stop của DevDeck khỏi settings.json.'}</span>
                <button className="btn primary" disabled={busy} onClick={() => { const a = confirmHook; setConfirmHook(null); void run(() => api.aiHook(a), a === 'install' ? 'Đã cài hook Stop' : 'Đã gỡ hook Stop') }}>Xác nhận</button>
                <button className="btn" onClick={() => setConfirmHook(null)}>Hủy</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="btn" disabled={busy} onClick={() => setConfirmHook('install')}>{st.hooks.some((h) => h.installed) ? 'Cài lại hook' : 'Cài hook Stop'}</button>
                {st.hooks.some((h) => h.installed) && <button className="btn" disabled={busy} onClick={() => setConfirmHook('uninstall')}>Gỡ hook</button>}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-medium text-fg">Theo repo / thư mục</h3>
            <p className="leading-relaxed text-fg-mute">Mặc định bật tất cả. Tắt một thư mục là tắt luôn mọi repo bên trong; bật riêng một repo con thì repo đó vẫn báo.</p>
            <div className="flex items-center gap-2">
              <input className="flex-1 font-mono" value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="Thêm thư mục: /Users/ban/work" spellCheck={false} aria-label="Đường dẫn thư mục" />
              {bridge()?.pickFolder && <button className="btn" onClick={() => void bridge()!.pickFolder!().then((r) => { if (r[0]) setNewPath(r[0]) })}>Chọn…</button>}
              <button className="btn" disabled={busy || !newPath.trim()} onClick={() => addRule(false)}>Tắt</button>
              <button className="btn" disabled={busy || !newPath.trim()} onClick={() => addRule(true)}>Bật</button>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc theo tên hoặc đường dẫn…" aria-label="Lọc thư mục" />
            <div className="flex max-h-72 flex-col overflow-auto">
              {rows.map((p) => {
                const e = effective(cfg.rules, p.path)
                return (
                  <label key={p.path} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={e.on} disabled={busy} onChange={(ev) => void save({ rules: setPath(cfg.rules, p.path, ev.target.checked) })} aria-label={`Thông báo cho ${p.name}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate font-mono text-fg-mute" title={p.path}>{p.path}</span>
                    </span>
                    {e.from === 'parent' && <span className="text-fg-mute" title={e.rule?.path}>theo thư mục cha</span>}
                    {e.from === 'self' && <Chip tone={e.on ? 'ok' : 'muted'}>{e.on ? 'bật riêng' : 'đã tắt'}</Chip>}
                    {p.providers.map((pv) => <Chip key={pv} tone="muted">{SOURCE_LABEL[pv] ?? pv}</Chip>)}
                  </label>
                )
              })}
              {!rows.length && <span className="py-2 text-fg-mute">{st.projects.length ? 'Không có thư mục khớp' : 'Chưa thấy thư mục nào trong log AI'}</span>}
            </div>
          </section>
        </>}
      </div>
    </Modal>
  )
}
