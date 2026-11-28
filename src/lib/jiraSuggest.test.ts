import { describe, expect, it } from 'vitest'
import { suggestTransition } from './jiraSuggest'

const T = [{ id: '1', name: 'Start', to: 'In Progress' }, { id: '2', name: 'Send', to: 'In Review' }, { id: '3', name: 'Finish', to: 'Done' }]

describe('suggestTransition', () => {
  it('MR đang mở → In Review', () => expect(suggestTransition(T, 'In Progress', ['opened'])?.transition.id).toBe('2'))
  it('MR đã merge → Done', () => expect(suggestTransition(T, 'In Review', ['merged'])?.transition.id).toBe('3'))
  it('merge thắng khi có cả hai', () => expect(suggestTransition(T, 'In Progress', ['opened', 'merged'])?.transition.id).toBe('3'))
  it('không gợi ý khi đã đúng trạng thái hoặc không có MR', () => {
    expect(suggestTransition(T, 'In Review', ['opened'])).toBeNull()
    expect(suggestTransition(T, 'Done', ['merged'])).toBeNull()
    expect(suggestTransition(T, 'In Progress', [])).toBeNull()
  })
  it('không có bước phù hợp thì không gợi ý', () => expect(suggestTransition([T[0]], 'To Do', ['opened'])).toBeNull())
})
