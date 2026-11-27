import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { relTime } from './format'
import { baseName, changeCount, isDirty, isOut, rootOf, shortPath, toneOf } from './repo'
import { nameFromUrl } from '../components/RepoDialogs'
import type { RepoSummary, UsageRow } from '../types'
import { csvCell, toCsv } from './csv'
import { buckets, OTHER_KEY, topSeries } from './usage'
import { unreadThreads } from './remoteWatch'
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
