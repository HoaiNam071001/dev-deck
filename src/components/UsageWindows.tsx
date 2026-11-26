import { useMemo, useState } from 'react'
import { PROVIDERS, providerOf } from '../lib/usage'
import { antigravityWindows, dayRank, parseResetOffset, providerWindows, tierOf, type AntigravityResets, type WindowStat } from '../lib/limits'
import { usePersisted } from '../lib/persist'
import { fmt, short } from '../lib/format'
import { ShareBar } from './ui'
import { api, useLoad } from '../api'
import type { AccountWindow, ClaudeProfile, Provider, UsageRow } from '../types'

type LimitKey = Provider | 'agy.gemini.week' | 'agy.claude.five' | 'agy.claude.week'
type Limits = Partial<Record<LimitKey, { five?: number; week?: number; limit?: number }>>

const left = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 6e4))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} phút`
}

const ERR: Record<string, string> = {
  'no-credentials': 'chưa thấy đăng nhập Claude Code',
  expired: 'phiên đăng nhập hết hạn, mở Claude Code một lần để làm mới',
  network: 'không kết nối được Anthropic',
}

/** Thanh hạn mức thật từ tài khoản (không cần nhập tay). */
function RealMeter({ label, w }: { label: string; w: AccountWindow }) {
  const tier = tierOf(w.pct / 100)
  const at = w.resetsAt ? new Date(w.resetsAt) : null
  const ms = at ? at.getTime() - Date.now() : 0
  const when = at ? (ms < 864e5 ? at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : at.toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : ''
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-l">{label}</span>
        <span className="meter-v mono">{w.pct.toFixed(0)}%</span>
        <span className="chip" style={{ color: tier.color, borderColor: tier.color }}>{tier.label}</span>
      </div>
      <ShareBar pct={w.pct} color={tier.color} />
      <div className="meter-sub"><span><b style={{ color: tier.color }}>Còn {Math.max(0, 100 - w.pct).toFixed(0)}%</b> · {at ? `reset ${when}${ms > 0 ? ` (sau ${left(ms)})` : ''}` : 'hạn mức tài khoản'}</span></div>
    </div>
  )
}

function Meter({ label, w, limit, onLimit, sub, showLeft, onReset }: {
  label: string; w: WindowStat; limit?: number; onLimit: (v: number | undefined) => void; sub?: string
  showLeft?: boolean; onReset?: (resetAt: number | undefined) => void
}) {
  const [edit, setEdit] = useState(false)
  const [mode, setMode] = useState<'pct' | 'tok'>(() => (w.used > 0 && showLeft ? 'pct' : 'tok'))
  const [val, setVal] = useState('')
  const [resetIn, setResetIn] = useState('')

  const hasBaseline = Boolean(limit) || (w.peak > w.used && w.peak > 0)
  const base = limit || (hasBaseline ? w.peak : 0)
  const ratio = base ? w.used / base : 0
  const pctUsed = Math.min(100, ratio * 100)
  const pctLeft = Math.max(0, 100 - ratio * 100)
  let tier = limit || hasBaseline || w.used === 0 ? tierOf(ratio) : { label: 'Chưa đặt hạn mức', color: 'var(--fg-mute)' }
  // Chỉ so với đỉnh cá nhân (không phải hạn mức thật) thì đừng báo đỏ "chạm trần"
  if (!limit && tier.label === 'Gần chạm trần') tier = { label: 'Gần đỉnh của bạn', color: 'var(--behind)' }
  const barColor = limit || hasBaseline ? tier.color : 'var(--ahead)'

  const openEdit = () => {
    const canPct = w.used > 0 && showLeft
    const nextMode = canPct && !limit ? 'pct' : 'tok'
    setMode(nextMode)
    setVal(limit ? (canPct && nextMode === 'pct' ? String(Math.round(pctLeft)) : String(Number((limit / 1e6).toFixed(3)))) : '')
    setResetIn(w.resetAt && w.resetAt > Date.now() ? left(w.resetAt - Date.now()) : '')
    setEdit(true)
  }

  const saveEdit = () => {
    const n = Number(val)
    if (val.trim() === '') {
      if (!onReset) onLimit(undefined)
    } else if (mode === 'pct') {
      if (n >= 0 && n < 100 && w.used > 0) onLimit(Math.round(w.used / (1 - n / 100)))
    } else if (n > 0) {
      onLimit(Math.round(n * 1e6))
    }
    if (onReset) {
      if (!resetIn.trim()) onReset(undefined)
      else {
        const ms = parseResetOffset(resetIn)
        if (ms) onReset(Date.now() + ms)
      }
    }
    setEdit(false)
  }

  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-l">{label}</span>
        <span className="meter-v mono">{showLeft && limit ? `${pctLeft.toFixed(0)}% còn lại` : short(w.used)}</span>
        <span className="chip" style={{ color: tier.color, borderColor: tier.color }}>{tier.label}</span>
      </div>
      <ShareBar pct={limit || hasBaseline ? pctUsed : 0} color={barColor} />
      <div className="meter-sub">
        <span>
          {limit
            ? (showLeft ? `${short(w.used)} / ${short(limit)} (${pctUsed.toFixed(0)}% đã dùng)` : `${pctUsed.toFixed(0)}% hạn mức ${short(limit)}`)
            : (hasBaseline ? `${pctUsed.toFixed(0)}% so với đỉnh (${short(w.peak)})` : (w.used > 0 ? `đỉnh lịch sử ${short(w.peak)}` : 'chưa dùng'))}
          {sub ? ` · ${sub}` : ''}
        </span>
        {!edit && (
          <button className="link-btn" onClick={openEdit} title="Đặt hạn mức hoặc khớp % từ bảng Usage của Antigravity">
            {limit ? 'Sửa' : (showLeft ? 'Khớp % Antigravity' : 'Đặt hạn mức')}
          </button>
        )}
      </div>
      {edit && (
        <form className="meter-edit" onSubmit={(e) => { e.preventDefault(); saveEdit() }}>
          {showLeft && (
            <select aria-label="Kiểu nhập" value={mode} onChange={(e) => { setMode(e.target.value as 'pct' | 'tok'); setVal('') }}>
              <option value="pct" disabled={w.used <= 0}>% còn lại{w.used <= 0 ? ' (cần >0 token)' : ''}</option>
              <option value="tok">Triệu token</option>
            </select>
          )}
          <input className="meter-in" autoFocus type="number" min={0} max={mode === 'pct' ? 99.9 : undefined} step="any"
            placeholder={mode === 'pct' ? 'vd: 82 (% left)' : 'triệu token'} value={val} onChange={(e) => setVal(e.target.value)} />
          {onReset && (
            <input className="meter-in" type="text" placeholder="reset (vd: 6d 23h)" value={resetIn} onChange={(e) => setResetIn(e.target.value)} />
          )}
          <button className="btn sm primary" type="submit">Lưu</button>
          {(limit || w.resetAt) && <button className="btn sm" type="button" onClick={() => { onLimit(undefined); onReset?.(undefined); setEdit(false) }}>Xoá</button>}
          <button className="btn sm" type="button" onClick={() => setEdit(false)}>Huỷ</button>
        </form>
      )}
    </div>
  )
}

/** Chọn / thêm / bỏ tài khoản Claude (mỗi tài khoản là một thư mục CLAUDE_CONFIG_DIR đã /login sẵn). */
function AccountPicker({ profiles, value, onChange, reload }: { profiles: ClaudeProfile[]; value: string; onChange: (dir: string) => void; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [dir, setDir] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const label = (p: ClaudeProfile) => (p.email ?? (p.dir ? p.path : 'Mặc định')) + (!p.dir && p.email ? ' (mặc định)' : '')

  const run = async (action: 'add' | 'remove', d: string) => {
    setBusy(true); setErr('')
    try {
      await api.claudeAccountAction(action, d)
      if (action === 'add') { onChange(d.trim()); setAdding(false); setDir('') } else onChange('')
      reload()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="acct">
      <div className="acct-row">
        <select aria-label="Tài khoản Claude" value={value} onChange={(e) => onChange(e.target.value)}>
          {profiles.map((p) => <option key={p.dir} value={p.dir}>{label(p)}</option>)}
        </select>
        <button className="link-btn" onClick={() => setAdding((a) => !a)}>{adding ? 'Đóng' : '+ Thêm'}</button>
        {value && <button className="link-btn" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => run('remove', value)} title="Chỉ bỏ khỏi danh sách, không xoá dữ liệu hay đăng xuất">Bỏ</button>}
      </div>
      {adding && (
        <form className="acct-add" onSubmit={(e) => { e.preventDefault(); void run('add', dir) }}>
          <input type="text" autoFocus placeholder="Đường dẫn thư mục, vd C:\Users\ban\.claude-work" value={dir} onChange={(e) => setDir(e.target.value)} />
          <button className="btn sm primary" type="submit" disabled={busy || !dir.trim()}>Thêm</button>
          <p className="muted">Tạo tài khoản mới: mở terminal, chạy <code>{'set CLAUDE_CONFIG_DIR=<thư mục> && claude'}</code> (PowerShell: <code>{'$env:CLAUDE_CONFIG_DIR="<thư mục>"; claude'}</code>), gõ <code>/login</code>, rồi dán đường dẫn thư mục vào đây.</p>
        </form>
      )}
      {err && <div className="banner err" role="alert">{err}</div>}
    </div>
  )
}

export function UsageWindows({ rows: allRows }: { rows: UsageRow[] }) {
  const [open, setOpen] = usePersisted<boolean>('ai.usage.open', true, (v) => typeof v === 'boolean')
  const [acct, setAcct] = usePersisted<string>('ai.claude.account', '', (v) => typeof v === 'string')
  const profilesLoad = useLoad(api.claudeAccounts, [])
  const profiles = profilesLoad.data ?? []
  // Tài khoản đã chọn mà không còn trong danh sách thì quay về mặc định
  const account = profiles.length && !profiles.some((p) => p.dir === acct) ? '' : acct
  // Log của Claude chỉ tính cho tài khoản đang chọn; các nhà cung cấp khác giữ nguyên
  const rows = useMemo(() => allRows.filter((r) => r.provider !== 'claude' || (r.account ?? '') === account), [allRows, account])
  const [limits, setLimits] = usePersisted<Limits>('ai.limits', {}, (v) => typeof v === 'object' && v !== null)
  const [agyResets, setAgyResets] = usePersisted<AntigravityResets>('ai.agy.resets', {}, (v) => typeof v === 'object' && v !== null)
  const now = useMemo(() => Date.now(), [rows])
  const accLoad = useLoad(() => api.claudeAccount(account), [account], 60000)
  const acc = accLoad.loading ? null : accLoad.data
  const wins = useMemo(() => providerWindows(rows, now), [rows, now])
  const agy = useMemo(() => antigravityWindows(rows, now, agyResets), [rows, now, agyResets])
  const rank = useMemo(() => dayRank(rows), [rows])
  const setLim = (p: Provider, k: 'five' | 'week', v: number | undefined) => setLimits((l) => ({ ...l, [p]: { ...l[p], [k]: v } }))
  const setAgyLim = (k: 'agy.gemini.week' | 'agy.claude.five' | 'agy.claude.week', v: number | undefined) =>
    setLimits((l) => ({ ...l, [k]: v === undefined ? undefined : { limit: v } }))
  const order = PROVIDERS.map((p) => p.id)
  const list = [...wins].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider))
  const dayTier = rank ? tierOf(rank.rank >= 0.9 ? 0.9 : rank.rank >= 0.6 ? 0.7 : rank.rank >= 0.25 ? 0.4 : rank.today ? 0.1 : 0) : null

  return (
    <section className="panel pad">
      <div className="panel-bar">
        <button className="collapse-h" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="collapse-ic" aria-hidden="true">{open ? '▾' : '▸'}</span><h2>Mức dùng hiện tại</h2>
        </button>
        {open ? (
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Tính input + output + cache ghi (bỏ cache đọc){rank && dayTier ? <> · Hôm nay <b style={{ color: dayTier.color }}>{dayTier.label}</b>: {short(rank.today)}, nhiều hơn {(rank.rank * 100).toFixed(0)}% ngày trước (trung vị {short(rank.median)})</> : null}
          </span>
        ) : (
          <span className="collapse-sum">
            {acc && !acc.error && acc.five && <span style={{ color: tierOf(acc.five.pct / 100).color }}>Claude 5h <b>{acc.five.pct.toFixed(0)}%</b></span>}
            {acc && !acc.error && acc.week && <span style={{ color: tierOf(acc.week.pct / 100).color }}>Claude tuần <b>{acc.week.pct.toFixed(0)}%</b></span>}
            {rank && dayTier && <span style={{ color: dayTier.color }}>Hôm nay <b>{dayTier.label}</b></span>}
          </span>
        )}
      </div>
      {open && <>
      <div className="usage-grid">
        {list.map((w) => {
          const p = providerOf(w.provider)
          if (w.provider === 'antigravity') {
            const gLim = limits['agy.gemini.week']?.limit
            const c5Lim = limits['agy.claude.five']?.limit
            const cwLim = limits['agy.claude.week']?.limit
            return (
              <div key="antigravity" className="usage-card">
                <div className="usage-h">
                  <i className="pdot" style={{ background: p?.color }} />{p?.label ?? 'Antigravity'}
                  <span className="chip chip-purple" style={{ marginLeft: 'auto' }}>2 nhóm quota</span>
                </div>
                <div className="usage-group">
                  <div className="usage-sub">Gemini Models</div>
                  <Meter label="Tuần (Weekly)" w={agy.gemini.week} limit={gLim} showLeft
                    onLimit={(v) => setAgyLim('agy.gemini.week', v)}
                    onReset={(r) => setAgyResets((s) => ({ ...s, geminiWeek: r }))}
                    sub={`${agy.gemini.week.resetAt ? `reset sau ${left(agy.gemini.week.resetAt - now)} · ` : ''}${fmt(agy.gemini.msgsWeek)} tin`} />
                </div>
                <div className="usage-group">
                  <div className="usage-sub">Claude &amp; GPT models</div>
                  <Meter label="Tuần (Weekly)" w={agy.claudeGpt.week} limit={cwLim} showLeft
                    onLimit={(v) => setAgyLim('agy.claude.week', v)}
                    onReset={(r) => setAgyResets((s) => ({ ...s, claudeWeek: r }))}
                    sub={agy.claudeGpt.week.resetAt ? `reset sau ${left(agy.claudeGpt.week.resetAt - now)} · ${fmt(agy.claudeGpt.msgsWeek)} tin` : (agy.claudeGpt.msgsWeek ? `${fmt(agy.claudeGpt.msgsWeek)} tin` : '100% còn lại')} />
                  <Meter label="Cửa sổ 5h" w={agy.claudeGpt.five} limit={c5Lim} showLeft
                    onLimit={(v) => setAgyLim('agy.claude.five', v)}
                    onReset={(r) => setAgyResets((s) => ({ ...s, claudeFive: r }))}
                    sub={agy.claudeGpt.five.resetAt ? `reset sau ${left(agy.claudeGpt.five.resetAt - now)} · ${fmt(agy.claudeGpt.msgs5)} tin` : (agy.claudeGpt.msgs5 ? `${fmt(agy.claudeGpt.msgs5)} tin` : '100% còn lại')} />
                </div>
              </div>
            )
          }

          const lim = limits[w.provider] ?? {}
          const real = w.provider === 'claude' && acc && !acc.error ? acc : null
          return (
            <div key={w.provider} className="usage-card">
              <div className="usage-h"><i className="pdot" style={{ background: p?.color }} />{p?.label ?? w.provider}{real && <span className="chip chip-ok" style={{ marginLeft: 'auto' }}>Tài khoản{real.plan ? ' · ' + real.plan : ''}</span>}</div>
              {w.provider === 'claude' && <AccountPicker profiles={profiles} value={account} onChange={setAcct} reload={profilesLoad.reload} />}
              {acc?.org && <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>{acc.org}</div>}
              {w.provider === 'claude' && acc?.error && <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>Chưa lấy được hạn mức thật ({ERR[acc.error] ?? acc.error}); đang hiện số ước lượng từ log.</div>}
              {real?.five && <RealMeter label="Phiên 5h" w={real.five} />}
              {real?.week && <RealMeter label="Tuần (7 ngày)" w={real.week} />}
              {!real && <>
              <Meter label="Cửa sổ 5h" w={w.five} limit={lim.five} onLimit={(v) => setLim(w.provider, 'five', v)}
                sub={w.five.active && w.five.resetAt ? `reset sau ${left(w.five.resetAt - now)} · ${fmt(w.msgs5)} tin` : 'chưa có phiên đang chạy'} />
              <Meter label="Tuần (7 ngày)" w={w.week} limit={lim.week} onLimit={(v) => setLim(w.provider, 'week', v)} />
              </>}
            </div>
          )
        })}
        {!list.length && <div className="empty">Chưa có dữ liệu</div>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        <b style={{ color: 'var(--accent)' }}>● Nhẹ/Vừa</b> dưới 60% · <b style={{ color: 'var(--behind)' }}>● Nhiều</b> 60–85% · <b style={{ color: 'var(--danger)' }}>● Gần chạm trần</b> từ 85%. Antigravity không có API công khai: bấm <b>Khớp %</b> để nhập % còn lại và giờ reset từ bảng Usage của nó.
      </p>
      </>}
    </section>
  )
}
