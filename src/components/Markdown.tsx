import { useState, type ReactNode } from 'react'
import { safeUrl } from './RemoteBits'

// Comment từ GitLab / GitHub là markdown trộn HTML (bot như pr-agent hay chèn <table>, <!-- -->, &nbsp;).
// Không render HTML thật: chuyển thẻ HTML đã biết thành chữ, rồi dựng React node cho một phần markdown nhỏ.
const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", hellip: '…', ndash: '–', mdash: '—' }
const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return m } })
  .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(Number(d)) } catch { return m } })
  .replace(/&([a-z]+|#39);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)

// Chỉ gỡ thẻ HTML phổ biến, để không xóa nhầm chữ như Array<string>
const TAGS = 'table|thead|tbody|tfoot|tr|td|th|strong|b|em|i|u|details|summary|p|div|span|br|hr|ul|ol|li|a|img|code|pre|h[1-6]|sup|sub|kbd|blockquote|font|center'
const TAG_BREAK = new RegExp(`<\\/?(?:br|hr|p|div|tr|li|ul|ol|table|thead|tbody|tfoot|h[1-6]|details|summary|blockquote|pre)\\b[^>]*>`, 'gi')
const TAG_CELL = /<\/t[dh]>/gi
const TAG_ANY = new RegExp(`<\\/?(?:${TAGS})\\b[^>]*>`, 'gi')

/** HTML lẫn markdown → markdown thuần (chưa có thẻ HTML, đã giải mã &entity;). Phần trong ``` được giữ nguyên. */
export function cleanBody(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => i % 2 ? part : decode(part.replace(TAG_CELL, ' │ ').replace(TAG_BREAK, '\n').replace(TAG_ANY, '')).replace(/[ \t ]{2,}/g, ' ').replace(/^[ \t]+/gm, ''))
    .join('')
    .replace(/(?:[ \t]*│[ \t]*)+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g

function inline(s: string, k: string): ReactNode[] {
  return s.split(INLINE).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={k + i} className="font-semibold text-fg">{p.slice(2, -2)}</b>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={k + i} className="mono rounded bg-raised px-1 text-[11.5px] text-fg">{p.slice(1, -1)}</code>
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p)
    if (m) { const u = safeUrl(m[2]); return u ? <a key={k + i} className="text-ahead hover:underline" href={u} target="_blank" rel="noopener noreferrer">{m[1]}</a> : m[1] }
    return p
  })
}

/** Markdown rút gọn (tiêu đề, danh sách, đoạn code, **đậm**, `code`, [link](url)) dựng thành React node, không dùng innerHTML. */
export function Markdown({ text }: { text: string }) {
  const blocks = cleanBody(text).split(/(```[\s\S]*?```)/g)
  return (
    <div className="flex flex-col gap-1.5 break-words text-[12.5px] leading-relaxed text-fg-soft">
      {blocks.map((b, bi) => {
        if (b.startsWith('```')) {
          const code = b.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').replace(/\n$/, '')
          return <pre key={bi} className="mono max-h-72 overflow-auto rounded-md bg-bg-chrome p-2.5 text-[11.5px] leading-normal text-fg-soft">{code}</pre>
        }
        return b.split('\n').map((line, li) => {
          const k = `${bi}.${li}.`
          if (!line.trim()) return null
          const h = /^(#{1,6})\s+(.*)$/.exec(line)
          if (h) return <div key={k} className="mt-1 text-[13px] font-semibold text-fg">{inline(h[2], k)}</div>
          const li2 = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line)
          if (li2) return <div key={k} className="flex gap-2 pl-1"><span className="text-fg-mute">•</span><span className="min-w-0">{inline(li2[1], k)}</span></div>
          if (/^>\s?/.test(line)) return <div key={k} className="border-l-2 border-border-strong pl-2.5 text-fg-mute">{inline(line.replace(/^>\s?/, ''), k)}</div>
          return <div key={k}>{inline(line, k)}</div>
        })
      })}
    </div>
  )
}

/** Thân comment dài (vd. báo cáo của bot) tự thu gọn, bấm để xem hết. */
export function CollapsibleMarkdown({ text, limit = 420 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false)
  const clean = cleanBody(text)
  const long = clean.length > limit || clean.split('\n').length > 10
  return (
    <div>
      <div className={long && !open ? 'relative max-h-40 overflow-hidden' : ''}>
        <Markdown text={text} />
        {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      {long && <button type="button" className="mt-1 text-[11.5px] text-ahead hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Xem thêm'}</button>}
    </div>
  )
}
