import { describe, expect, it } from 'vitest'
import { parseDuration } from './jiraTime'

describe('parseDuration', () => {
  it('hiểu h / m', () => {
    expect(parseDuration('1h30m')).toBe(5400)
    expect(parseDuration('2h')).toBe(7200)
    expect(parseDuration('45m')).toBe(2700)
    expect(parseDuration('1.5h')).toBe(5400)
    expect(parseDuration(' 1h 15m ')).toBe(4500)
  })
  it('từ chối giá trị sai hoặc ngoài khoảng', () => {
    for (const x of ['', 'abc', '0m', '30s', '25h', '-1h', 'h']) expect(parseDuration(x)).toBeNull()
  })
})
