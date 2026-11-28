import { describe, expect, it } from 'vitest'
import { readDraft, writeDraft } from './commitDraft'

describe('commitDraft', () => {
  it('nhớ theo từng repo và xóa khi rỗng', () => {
    writeDraft('/a', { message: 'x', amend: false })
    expect(readDraft('/a').message).toBe('x')
    expect(readDraft('/b')).toEqual({ message: '', amend: false })
    writeDraft('/a', { message: '', amend: false })
    expect(readDraft('/a').message).toBe('')
  })
})
