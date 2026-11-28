import { describe, expect, it } from 'vitest'
import { branchName, crDraft, slugify } from './jiraBranch'

describe('jiraBranch', () => {
  it('slugify bỏ dấu tiếng Việt', () => {
    expect(slugify('Sửa lỗi đăng nhập  Đà Nẵng!')).toBe('sua-loi-dang-nhap-da-nang')
    expect(slugify('')).toBe('')
  })
  it('slugify cắt ở ranh giới từ', () => {
    const s = slugify('thêm tính năng xuất báo cáo doanh thu theo tháng cho khách hàng', 30)
    expect(s.length).toBeLessThanOrEqual(30)
    expect(s.endsWith('-')).toBe(false)
  })
  it('branchName theo loại ticket', () => {
    expect(branchName({ key: 'ABC-12', summary: 'Lỗi thanh toán', type: 'Bug' })).toBe('fix/ABC-12-loi-thanh-toan')
    expect(branchName({ key: 'ABC-13', summary: 'Add login', type: 'Story' })).toBe('feature/ABC-13-add-login')
    expect(branchName({ key: 'ABC-14', summary: '!!!', type: '' })).toBe('feature/ABC-14')
  })
  it('crDraft', () => {
    expect(crDraft({ key: 'A-1', summary: 'x', url: 'https://j/browse/A-1' })).toEqual({ title: 'A-1: x', description: 'Ticket: https://j/browse/A-1' })
  })
})
