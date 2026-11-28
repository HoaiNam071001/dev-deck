import { describe, expect, it } from 'vitest'
import { freshEvents } from './jiraWatch'
import type { JiraNewItem } from '../types'

const item = (key: string, texts: string[]): JiraNewItem => ({
  issue: { key } as JiraNewItem['issue'], pinned: false, via: [], events: texts.map((text) => ({ kind: 'status', text })),
})

describe('freshEvents', () => {
  it('lần đầu chỉ ghi nhớ, không báo dồn', () => {
    const r = freshEvents(null, [item('A-1', ['x → y'])])
    expect(r.fresh).toEqual([])
    expect(r.next).toHaveLength(1)
  })
  it('chỉ báo sự kiện mới, không báo lại', () => {
    const first = freshEvents(null, [item('A-1', ['a'])])
    const r = freshEvents(first.next, [item('A-1', ['a', 'b']), item('B-2', ['c'])])
    expect(r.fresh).toEqual([{ key: 'A-1', text: 'b' }, { key: 'B-2', text: 'c' }])
    expect(freshEvents(r.next, [item('A-1', ['a', 'b']), item('B-2', ['c'])]).fresh).toEqual([])
  })
})
