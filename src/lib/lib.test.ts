import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { relTime } from './format'
import { baseName, changeCount, isDirty, isOut, rootOf, shortPath, toneOf, worktreeDir } from './repo'
import { nameFromUrl } from '../components/RepoDialogs'
import type { RepoSummary, UsageRow } from '../types'
import { csvCell, toCsv } from './csv'
import { buckets, OTHER_KEY, topSeries } from './usage'
import { diffCrs, unreadThreads } from './remoteWatch'
import { diffRows, hunkContext, hunkStats, stepIndex } from './diff'
import { authorQueue, queueCounts, reviewQueue, reviewState, reviewerWait, sizeLines, waitAlerts, waitHours, waitLevel, waitSince } from './reviewQueue'
import type { ChangeRequest } from '../types'

const repo = (o: Partial<RepoSummary> = {}): RepoSummary => ({
  path: 'C:\\code\\a', name: 'a', branch: 'main', detached: false, head: 'abc1234', upstream: 'origin/main', ahead: 0, behind: 0,
  staged: 0, modified: 0, untracked: 0, conflicts: 0, branches: ['main'], lastCommit: null, ...o,
} as RepoSummary)

describe('relTime (bucket thời gian)', () => {
  const NOW = new Date('2026-06-15T12:00:00Z').getTime()
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(() => vi.useRealTimers())
  const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString()
  it.each([
    [10, 'vừa xong'], [59, 'vừa xong'], [60, '1 phút trước'], [3599, '59 phút trước'], [3600, '1 giờ trước'],
    [86399, '23 giờ trước'], [86400, '1 ngày trước'], [86400 * 29, '29 ngày trước'], [86400 * 30, '1 tháng trước'],
    [86400 * 364, '12 tháng trước'], [86400 * 365, '1 năm trước'], [86400 * 800, '2 năm trước'],
  ])('%i giây trước → %s', (sec, text) => expect(relTime(ago(sec))).toBe(text))
  it('rỗng → gạch ngang', () => { expect(relTime(null)).toBe('—'); expect(relTime(undefined)).toBe('—'); expect(relTime('')).toBe('—') })
})

describe('repo helpers', () => {
  it('changeCount / isDirty / isOut', () => {
    expect(changeCount(repo({ staged: 1, modified: 2, untracked: 3, conflicts: 1 }))).toBe(7)
    expect(isDirty(repo())).toBe(false); expect(isDirty(repo({ untracked: 1 }))).toBe(true)
    expect(isOut(repo({ ahead: 1 }))).toBe(true); expect(isOut(repo({ behind: 2 }))).toBe(true); expect(isOut(repo())).toBe(false)
  })
  it('toneOf', () => {
    expect(toneOf(repo())).toBe('ok'); expect(toneOf(repo({ modified: 1 }))).toBe('dirty')
    expect(toneOf(repo({ conflicts: 1 }))).toBe('danger'); expect(toneOf(repo({ error: 'lỗi' }))).toBe('danger')
  })
  it('rootOf chọn gốc sâu nhất, bỏ qua kiểu dấu gạch và hoa thường', () => {
    const roots = ['C:\\Users\\me\\Desktop', 'C:\\Users\\me\\Desktop\\golabs']
    expect(rootOf('c:/users/me/desktop/golabs/app', roots)).toBe('C:\\Users\\me\\Desktop\\golabs')
    expect(rootOf('C:\\Users\\me\\Desktop\\other', roots)).toBe('C:\\Users\\me\\Desktop')
    expect(rootOf('D:\\x', roots)).toBeUndefined()
    expect(rootOf('C:\\Users\\me\\Desktop-old\\x', roots)).toBeUndefined()
  })
  it('baseName / shortPath', () => {
    expect(baseName('C:\\a\\b\\')).toBe('b'); expect(baseName('/x/y/z')).toBe('z')
    expect(shortPath('C:\\short')).toBe('C:\\short'); expect(shortPath('x'.repeat(50))).toHaveLength(34)
  })
})

describe('nameFromUrl (gợi ý tên thư mục khi clone)', () => {
  it.each([
    ['https://github.com/a/b.git', 'b'], ['https://gitlab.com/g/s/app/', 'app'], ['git@github.com:a/b-c.git', 'b-c'], ['ssh://git@h:22/x/y.git', 'y'], ['', ''],
  ])('%s → %s', (u, n) => expect(nameFromUrl(u)).toBe(n))
})

describe('csv', () => {
  it('bọc ô có dấu phẩy / nháy kép / xuống dòng', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('nói "x"')).toBe('"nói ""x"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
    expect(csvCell(12)).toBe('12')
  })
  it('chặn công thức Excel ở ô chữ, không đụng số âm', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('-cmd')).toBe("'-cmd")
    expect(csvCell(-5)).toBe('-5')
  })
  it('toCsv nối dòng bằng CRLF', () => {
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a,1\r\nb,2\r\n')
  })
})

describe('biểu đồ theo dự án', () => {
  const row = (project: string, t: string, n: number): UsageRow => ({ provider: 'claude', t, project, model: 'm', input: n, output: 0, cacheWrite: 0, cacheRead: 0 } as UsageRow)
  const rows = [row('a', '2026-06-15T01:00:00Z', 100), row('b', '2026-06-15T01:10:00Z', 50), row('c', '2026-06-15T01:20:00Z', 5), row('a', '2026-06-15T02:30:00Z', 10)]
  it('topSeries lấy dự án lớn nhất, phần còn lại gộp vào "Khác"', () => {
    expect(topSeries(rows, 2).map((s) => s.k)).toEqual(['a', 'b', OTHER_KEY])
    expect(topSeries(rows, 5).map((s) => s.k)).toEqual(['a', 'b', 'c'])
  })
  it('buckets cộng theo dự án, khóa lạ vào "Khác"', () => {
    const out = buckets(rows, 60, (r) => r.project, new Set(['a', 'b']))
    const sumOf = (k: string) => out.reduce((s, b) => s + (b.bySeries[k] ?? 0), 0)
    expect(sumOf('a')).toBe(110)
    expect(sumOf('b')).toBe(50)
    expect(sumOf(OTHER_KEY)).toBe(5)
  })
})

describe('unreadThreads (badge thread mới ở Remotes)', () => {
  const cr = (key: string, total: number, state: ChangeRequest['state'] = 'opened') => ({ key, state, threads: { resolved: 0, total } } as ChangeRequest)
  it('lần đầu chỉ lấy mốc, không đếm', () => {
    expect(unreadThreads(null, [cr('a', 3)])).toEqual({ count: 0, read: { a: 3 } })
  })
  it('đếm thread tăng thêm, giữ mốc cho tới khi mở tab', () => {
    const r = unreadThreads({ a: 3, b: 1 }, [cr('a', 5), cr('b', 1)])
    expect(r.count).toBe(2)
    expect(r.read).toEqual({ a: 3, b: 1 })
  })
  it('MR mới xuất hiện tính cả thread đang có; MR đã đóng bỏ qua', () => {
    expect(unreadThreads({ a: 1 }, [cr('a', 1), cr('n', 2), cr('m', 4, 'merged')]).count).toBe(2)
  })
  it('thread bị xóa thì hạ mốc', () => {
    const r = unreadThreads({ a: 4 }, [cr('a', 2)])
    expect(r).toEqual({ count: 0, read: { a: 2 } })
    expect(unreadThreads(r.read, [cr('a', 3)]).count).toBe(1)
  })
})

describe('reviewQueue (hàng đợi review)', () => {
  const NOW = Date.parse('2026-11-27T12:00:00Z')
  const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString()
  const cr = (key: string, o: Partial<ChangeRequest> = {}) => ({ key, state: 'opened', reviewMe: true, mine: false, draft: false, createdAt: h(1), reviewRequestedAt: null, ...o } as ChangeRequest)
  it('mốc chờ: ưu tiên lúc được yêu cầu review, không thì createdAt', () => {
    expect(waitSince(cr('a', { reviewRequestedAt: h(3), createdAt: h(30) }))).toEqual({ at: h(3), exact: true })
    expect(waitSince(cr('a', { createdAt: h(30) }))).toEqual({ at: h(30), exact: false })
  })
  it('giờ chờ không âm, ngày hỏng → 0', () => {
    expect(waitHours(cr('a', { createdAt: h(5) }), NOW)).toBeCloseTo(5)
    expect(waitHours(cr('a', { createdAt: h(-2) }), NOW)).toBe(0)
    expect(waitHours(cr('a', { createdAt: 'xx' }), NOW)).toBe(0)
  })
  it('mức chờ theo ngưỡng 4h / 24h, ngưỡng sửa được', () => {
    expect([0, 3.9, 4, 23.9, 24].map((x) => waitLevel(x))).toEqual(['ok', 'ok', 'warn', 'warn', 'late'])
    expect(waitLevel(2, 1, 2)).toBe('late')
  })
  it('độ lớn: null khi thiếu số dòng', () => {
    expect(sizeLines({ size: { additions: 10, deletions: 5, files: 2 } })).toBe(15)
    expect(sizeLines({ size: { additions: null, deletions: null, files: 3 } })).toBeNull()
    expect(sizeLines({})).toBeNull()
  })
  it('hàng đợi: chỉ MR mở của người khác tôi được yêu cầu; chờ lâu nhất trước, draft cuối', () => {
    const q = reviewQueue([
      cr('new', { createdAt: h(1) }), cr('old', { createdAt: h(40) }), cr('draft', { createdAt: h(90), draft: true }),
      cr('mine', { mine: true, createdAt: h(99) }), cr('merged', { state: 'merged', createdAt: h(99) }), cr('notme', { reviewMe: false, createdAt: h(99) }),
    ], NOW)
    expect(q.map((c) => c.key)).toEqual(['old', 'new', 'draft'])
  })
})

describe('authorQueue (MR của tôi đang chờ ai)', () => {
  const NOW = Date.parse('2026-11-27T12:00:00Z')
  const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString()
  const mk = (key: string, o: Partial<ChangeRequest> = {}) => ({ key, state: 'opened', mine: true, draft: false, createdAt: h(50), waitingOn: [], ...o } as ChangeRequest)
  it('mốc chờ từng reviewer: since nếu có, không thì createdAt', () => {
    expect(reviewerWait({ since: h(3) }, { createdAt: h(50) }, NOW)).toEqual({ hours: 3, exact: true })
    expect(reviewerWait({ since: null }, { createdAt: h(50) }, NOW)).toEqual({ hours: 50, exact: false })
  })
  it('chỉ MR mở của tôi còn người chưa phản hồi; người chờ lâu nhất trước, draft cuối', () => {
    const w = (since: string | null) => [{ name: 'A', username: 'a', since }]
    const q = authorQueue([
      mk('short', { waitingOn: w(h(2)) }), mk('long', { waitingOn: [...w(h(5)), ...w(h(30))] }), mk('draft', { draft: true, waitingOn: w(h(99)) }),
      mk('done'), mk('theirs', { mine: false, waitingOn: w(h(99)) }), mk('merged', { state: 'merged', waitingOn: w(h(99)) }),
    ], NOW)
    expect(q.map((c) => c.key)).toEqual(['long', 'short', 'draft'])
  })
})

describe('reviewState (trạng thái riêng của tôi)', () => {
  const T = (m: number) => new Date(Date.UTC(2026, 10, 27, 0, m)).toISOString()
  it('chưa review: chưa xem / đang xem theo dấu của tôi', () => {
    expect(reviewState({}, false)).toBe('new')
    expect(reviewState({ myReviewAt: null }, true)).toBe('reviewing')
  })
  it('đã review: chờ tác giả sửa, có commit mới hơn thì cần xem lại', () => {
    expect(reviewState({ myReviewAt: T(10), lastCommitAt: T(5) }, false)).toBe('waiting')
    expect(reviewState({ myReviewAt: T(10), lastCommitAt: T(20) }, true)).toBe('again')
    expect(reviewState({ myReviewAt: T(10), lastCommitAt: null }, false)).toBe('waiting')
  })
})

describe('waitAlerts / queueCounts (nhắc review trễ)', () => {
  const NOW = Date.parse('2026-11-27T12:00:00Z')
  const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString()
  const cr = (key: string, hours: number, o: Partial<ChangeRequest> = {}) => ({ key, project: 'g/p', number: 1, provider: 'github', title: 't', state: 'opened', reviewMe: true, mine: false, draft: false, createdAt: h(hours), ...o } as ChangeRequest)
  it('lần đầu chỉ ghi mốc', () => {
    const r = waitAlerts(null, [cr('a', 30)], NOW)
    expect(r.alerts).toEqual([])
    expect(r.next).toEqual({ a: 'late' })
  })
  it('báo một lần khi vượt vàng rồi đỏ, không báo lặp', () => {
    const s1 = waitAlerts({ a: 'ok' }, [cr('a', 5)], NOW)
    expect(s1.alerts.map((x) => x.level)).toEqual(['warn'])
    expect(waitAlerts(s1.next, [cr('a', 6)], NOW).alerts).toEqual([])
    const s2 = waitAlerts(s1.next, [cr('a', 30)], NOW)
    expect(s2.alerts.map((x) => x.level)).toEqual(['late'])
    expect(waitAlerts(s2.next, [cr('a', 31)], NOW).alerts).toEqual([])
  })
  it('MR mới đã trễ được báo; draft không báo; MR rời hàng đợi bị bỏ khỏi mốc', () => {
    const r = waitAlerts({ gone: 'late' }, [cr('n', 30), cr('d', 30, { draft: true })], NOW)
    expect(r.alerts.map((x) => x.key)).toEqual(['n'])
    expect(Object.keys(r.next).sort()).toEqual(['d', 'n'])
  })
  it('đếm chờ và trễ, bỏ draft', () => {
    expect(queueCounts([cr('a', 1), cr('b', 30), cr('c', 99, { draft: true })], NOW)).toEqual({ waiting: 2, late: 1 })
  })
})

describe('diff (số dòng theo hunk)', () => {
  const h = { header: '@@ -10,4 +10,5 @@ function foo() {', hash: 'x', lines: [' a', '-b', '+c', '+d', ' e\r', '\\ No newline at end of file'] }
  it('đánh số dòng cũ / mới, bỏ \r, nhận dòng ghi chú', () => {
    expect(diffRows(h).map((r) => [r.kind, r.old, r.new, r.text])).toEqual([
      ['ctx', 10, 10, 'a'], ['del', 11, undefined, 'b'], ['add', undefined, 11, 'c'], ['add', undefined, 12, 'd'], ['ctx', 12, 13, 'e'], ['note', undefined, undefined, '\\ No newline at end of file'],
    ])
  })
  it('tiêu đề không có số dòng đếm (@@ -5 +5 @@) vẫn đọc được', () => {
    expect(diffRows({ header: '@@ -5 +7 @@', hash: 'y', lines: ['-x', '+y'] }).map((r) => [r.old, r.new])).toEqual([[5, undefined], [undefined, 7]])
  })
  it('ngữ cảnh, thống kê, bước chọn', () => {
    expect(hunkContext(h)).toBe('function foo() {'); expect(hunkContext({ ...h, header: '@@ -1 +1 @@' })).toBe('')
    expect(hunkStats(h)).toEqual({ add: 2, del: 1 })
    expect([stepIndex(0, -1, 3), stepIndex(0, 1, 3), stepIndex(2, 1, 3), stepIndex(0, 1, 0)]).toEqual([0, 1, 2, -1])
  })
})

describe('diffCrs: thông báo conflict', () => {
  const mr = (conflict: boolean | null) => ({ key: 'k', state: 'opened', mine: true, reviewMe: false, project: 'g/p', number: 361, title: 't', ci: 'passed', conflict, threads: { resolved: 0, total: 0 } } as unknown as ChangeRequest)
  const run = (seq: (boolean | null)[]) => {
    let seen = diffCrs(null, [mr(seq[0])]).next
    const out: string[] = []
    for (const c of seq.slice(1)) { const r = diffCrs(seen, [mr(c)]); seen = r.next; out.push(...r.events.map((e) => e.title)) }
    return out
  }
  it('MR đã conflict từ trước, trạng thái chập chờn "chưa rõ" không báo lại', () => {
    expect(run([true, null, true, true, null, true])).toEqual([])
  })
  it('đang chưa rõ rồi có kết quả conflict ở lần đầu thấy thì không báo', () => {
    expect(run([null, true])).toEqual([])
  })
  it('đang sạch rồi mới conflict thì báo; qua cả lúc chưa rõ', () => {
    expect(run([false, true])).toEqual(['MR bị conflict'])
    expect(run([false, null, true])).toEqual(['MR bị conflict'])
  })
})

describe("worktreeDir", () => {
  it("<repo>-wt/<nhanh>, giu kieu dau phan cach", () => {
    expect(worktreeDir('C:\\code\\app', 'feat/login')).toBe('C:\\code\\app-wt\\feat-login')
    expect(worktreeDir("/home/u/app/", "fix")).toBe("/home/u/app-wt/fix")
  })
})
