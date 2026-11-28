import { describe, expect, it } from 'vitest'
import { ticketKey } from './jiraKey'

describe('ticketKey', () => {
  it('mã trơn', () => { expect(ticketKey(' pg-5126 ')).toBe('PG-5126'); expect(ticketKey('ABC-1')).toBe('ABC-1') })
  it('link browse', () => { expect(ticketKey('https://x.atlassian.net/browse/PG-5126')).toBe('PG-5126'); expect(ticketKey('https://x.atlassian.net/browse/PG-5126?focusedCommentId=1')).toBe('PG-5126') })
  it('link board', () => expect(ticketKey('https://x.atlassian.net/jira/software/projects/PG/boards/3?selectedIssue=PG-77')).toBe('PG-77'))
  it('không có mã', () => { expect(ticketKey('')).toBeNull(); expect(ticketKey('hello')).toBeNull(); expect(ticketKey('https://x.atlassian.net/jira/software')).toBeNull() })
})
