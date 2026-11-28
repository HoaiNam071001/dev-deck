import { describe, expect, it } from 'vitest'
import { clampWidth, dragWidth, keyWidth, readWidth } from './resize'

describe('resize', () => {
  it('kẹp độ rộng trong khoảng và làm tròn', () => {
    expect(clampWidth(100, 160, 420)).toBe(160)
    expect(clampWidth(999, 160, 420)).toBe(420)
    expect(clampWidth(250.6, 160, 420)).toBe(251)
  })

  it('kéo: panel trái rộng ra khi kéo sang phải, panel phải rộng ra khi kéo sang trái', () => {
    expect(dragWidth(200, 300, 340, 'right', 160, 420)).toBe(240)
    expect(dragWidth(460, 900, 860, 'left', 380, 720)).toBe(500)
    expect(dragWidth(200, 300, 0, 'right', 160, 420)).toBe(160)
  })

  it('phím: mũi tên theo hướng kéo, Home về mặc định, phím khác bỏ qua', () => {
    const o = { min: 160, max: 420, def: 200, step: 16 }
    expect(keyWidth(200, 'ArrowRight', { ...o, edge: 'right' })).toBe(216)
    expect(keyWidth(200, 'ArrowLeft', { ...o, edge: 'right' })).toBe(184)
    expect(keyWidth(200, 'ArrowLeft', { ...o, edge: 'left' })).toBe(216)
    expect(keyWidth(300, 'Home', { ...o, edge: 'right' })).toBe(200)
    expect(keyWidth(200, 'Enter', { ...o, edge: 'right' })).toBeNull()
  })

  it('đọc: lấy khóa đầu tiên hợp lệ, bỏ giá trị hỏng / ngoài khoảng', () => {
    const store: Record<string, string> = { a: '"x"', b: '999', c: '240', bad: '{' }
    const get = (k: string) => store[k] ?? null
    expect(readWidth(get, ['a', 'b', 'c'], 160, 420, 200)).toBe(240)
    expect(readWidth(get, ['bad', 'none'], 160, 420, 200)).toBe(200)
    expect(readWidth(() => { throw new Error('chặn') }, ['c'], 160, 420, 200)).toBe(200)
  })
})
