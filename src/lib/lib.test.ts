import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { relTime } from './format'
import { baseName, changeCount, isDirty, isOut, rootOf, shortPath, toneOf } from './repo'
import { nameFromUrl } from '../components/RepoDialogs'
import type { RepoSummary } from '../types'

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
