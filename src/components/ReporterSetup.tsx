import { useState } from 'react'
import { api, useLoad } from '../api'
import { bridge } from '../lib/platform'
import { toast } from '../lib/store'
import type { ReporterStatus } from '../types'
import { FolderPicker } from './FolderPicker'
import { Modal } from './Modal'
import { Chip, Icon, Spinner, type Tone } from './ui'

const STATE: Record<string, { label: string; tone: Tone }> = {
  ok: { label: 'Đã cài', tone: 'ok' }, outdated: { label: 'Bản cũ', tone: 'behind' }, none: { label: 'Chưa cài', tone: 'muted' }, missing: { label: 'Không còn thư mục', tone: 'danger' },
}

/** Cài reporter tiến độ vitest dùng chung: chọn thư mục chứa các project, và bật tự thêm cờ khi chạy `vitest run`. */
export function ReporterSetup({ onClose }: { onClose: () => void }) {
  const st = useLoad(api.reporterStatus, [])
  const [extra, setExtra] = useState<string[]>([]) // thư mục vừa chọn, chưa cài
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const data: ReporterStatus | null = st.data
  const rows = [
    ...(data?.folders ?? []),
    ...extra.filter((p) => !(data?.folders ?? []).some((f) => f.path.toLowerCase() === p.toLowerCase())).map((p) => ({ path: p, state: 'none' as const, tracked: false })),
  ]
  const pending = rows.filter((r) => r.state === 'none' || r.state === 'outdated')

  const run = async (key: string, body: Parameters<typeof api.reporterSetup>[0], okMsg: string) => {
    setBusy(key)
    try { await api.reporterSetup(body); setExtra([]); st.reload(); toast({ kind: 'ok', title: okMsg }) }
    catch (e) { toast({ kind: 'err', title: 'Không thực hiện được', detail: (e as Error).message }) }
    setBusy(null)
  }
  const pickFolder = async () => {
    const pick = bridge()?.pickFolder
    if (!pick) { setPicking(true); return }
    const dirs = await pick()
    if (dirs.length) setExtra((x) => [...new Set([...x, ...dirs])])
  }

  return (
    <>
      <Modal onClose={onClose} titleId="reporter-title" header={<h2 id="reporter-title">Cài tiến độ test (vitest) dùng chung</h2>}>
        <div className="flex flex-col gap-4 p-4 text-[13px]">
          {st.error && <div className="banner err" role="alert">{st.error}</div>}
          {st.loading && !data && <Spinner label="Đang đọc trạng thái…" />}

          <section className="flex flex-col gap-2">
            <div>
              <div className="font-semibold">1 · Chọn thư mục chứa các project</div>
              <div className="text-[12px] text-fg-mute">Gói <span className="mono">devdeck-reporter</span> được đặt vào <span className="mono">&lt;thư mục&gt;/node_modules</span> (thường đã bị gitignore). Mọi project nằm bên dưới thư mục này đều tìm thấy nó. Chỉ vitest ≥ 3.</div>
            </div>
            <div className="overflow-hidden rounded-[7px] border border-border">
              {rows.length === 0 && <div className="px-3 py-2 text-fg-mute">Chưa có thư mục nào. Bấm "Chọn thư mục…".</div>}
              {rows.map((r) => (
                <div key={r.path} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0">
                  <Icon name="folder" size={13} />
                  <span className="mono min-w-0 flex-1 truncate" title={r.path}>{r.path}</span>
                  <Chip tone={STATE[r.state].tone}>{STATE[r.state].label}</Chip>
                  {(r.state === 'none' || r.state === 'outdated') &&
                    <button className="btn !h-6 !px-2" disabled={busy !== null} onClick={() => void run('i:' + r.path, { action: 'install', folders: [r.path] }, 'Đã cài reporter')}>{r.state === 'outdated' ? 'Cập nhật' : 'Cài'}</button>}
                  {(r.state === 'ok' || r.state === 'outdated') &&
                    <button className="btn !h-6 !px-2" disabled={busy !== null} title="Gỡ gói khỏi thư mục này" onClick={() => void run('u:' + r.path, { action: 'uninstall', folders: [r.path] }, 'Đã gỡ reporter')}>Gỡ</button>}
                  {r.state === 'none' && extra.includes(r.path) &&
                    <button className="ghost flex size-5 items-center justify-center" aria-label="Bỏ khỏi danh sách" onClick={() => setExtra((x) => x.filter((p) => p !== r.path))}><Icon name="x" size={11} /></button>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn !h-7" onClick={() => void pickFolder()}><Icon name="plus" size={12} />Chọn thư mục…</button>
              {pending.length > 1 && <button className="btn primary !h-7" disabled={busy !== null} onClick={() => void run('all', { action: 'install', folders: pending.map((p) => p.path) }, `Đã cài ${pending.length} thư mục`)}>Cài tất cả ({pending.length})</button>}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div>
              <div className="font-semibold">2 · Tự thêm cờ khi chạy <span className="mono">vitest run</span> (khuyên dùng)</div>
              <div className="text-[12px] text-fg-mute">Đặt biến môi trường <span className="mono">NODE_OPTIONS</span> của tài khoản Windows để lệnh <span className="mono">vitest run</span> (tay hay AI gõ) tự có tiến độ, khỏi gõ cờ hay sửa vite.config. Chỉ có tác dụng với project tìm thấy gói ở bước 1; project khác chạy như cũ.</div>
            </div>
            {data && !data.supported && <div className="banner">Bước này chỉ hỗ trợ Windows. Bạn vẫn có thể dùng bước 1 rồi thêm cờ <span className="mono">--reporter=devdeck-reporter</span> vào lệnh.</div>}
            {data?.supported && (
              <div className="rounded-[7px] border border-border bg-bg p-3">
                <div className="flex items-center gap-2">
                  <Chip tone={data.enabled ? 'ok' : 'muted'}>{data.enabled ? 'Đang bật' : 'Đang tắt'}</Chip>
                  <span className="text-fg-mute">NODE_OPTIONS hiện tại: <span className="mono text-fg-soft">{data.nodeOptions || '(trống)'}</span></span>
                  <span className="ml-auto flex-none">
                    {data.enabled
                      ? <button className="btn !h-7" disabled={busy !== null} onClick={() => void run('off', { action: 'disable' }, 'Đã tắt tự thêm cờ')}>Tắt</button>
                      : <button className="btn primary !h-7" disabled={busy !== null} onClick={() => void run('on', { action: 'enable' }, 'Đã bật tự thêm cờ')}>Bật</button>}
                  </span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-[12px] text-fg-mute">
                  <li>Giữ nguyên các giá trị <span className="mono">NODE_OPTIONS</span> bạn đã đặt; tắt chỉ bỏ phần của DevDeck.</li>
                  <li>Cần <b className="text-fg-soft">mở lại terminal, VS Code và DevDeck</b> để có hiệu lực.</li>
                  <li>Lệnh có sẵn cờ <span className="mono">--reporter</span> thì giữ nguyên; muốn tắt tạm một lần thì đặt <span className="mono">DEVDECK_NO_REPORTER=1</span>.</li>
                  <li>Cờ tự thêm thay các reporter khai báo trong vite.config cho lần chạy đó.</li>
                </ul>
              </div>
            )}
          </section>
        </div>
      </Modal>
      {picking && <FolderPicker start={rows[rows.length - 1]?.path ?? ''} selected={extra} recent={[]} onClose={() => setPicking(false)}
        onToggle={(p) => setExtra((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} />}
    </>
  )
}
