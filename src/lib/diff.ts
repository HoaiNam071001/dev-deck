import type { DiffHunk } from '../types'

export interface DiffRow { kind: 'add' | 'del' | 'ctx' | 'note'; old?: number; new?: number; text: string }

/** Gán số dòng cũ / mới cho từng dòng của hunk, theo tiêu đề "@@ -a,b +c,d @@". */
export function diffRows(h: DiffHunk): DiffRow[] {
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(h.header)
  let o = m ? +m[1] : 1, n = m ? +m[2] : 1
  return h.lines.map((l): DiffRow => {
    const c = l[0]
    const text = l.slice(1).replace(/\r$/, '')
    if (c === '+') return { kind: 'add', new: n++, text }
    if (c === '-') return { kind: 'del', old: o++, text }
    if (c === '\\') return { kind: 'note', text: l }
    return { kind: 'ctx', old: o++, new: n++, text }
  })
}

/** Phần mô tả sau "@@ … @@" (thường là tên hàm), rỗng nếu không có. */
export const hunkContext = (h: DiffHunk) => h.header.replace(/^@@[^@]*@@ ?/, '')

export const hunkStats = (h: DiffHunk) => ({ add: h.lines.filter((l) => l[0] === '+').length, del: h.lines.filter((l) => l[0] === '-').length })

/** Chỉ số kế tiếp trong [0, n) khi bấm ↑↓ / ]·[; không quay vòng, n = 0 thì -1. */
export const stepIndex = (cur: number, dir: 1 | -1, n: number) => (n ? Math.min(n - 1, Math.max(0, cur + dir)) : -1)
