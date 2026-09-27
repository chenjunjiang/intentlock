import { describe, expect, it } from 'vitest'
import { parseProductEvent } from '../src/lib/event'

describe('anonymous event protocol', () => {
  it('accepts an allowlisted aggregate event', () => {
    expect(parseProductEvent({ eventName: 'analysis_completed', sessionId: 'session-123', metadata: { riskCount: 2 } }))
      .toEqual({ eventName: 'analysis_completed', sessionId: 'session-123', metadata: { riskCount: 2 } })
  })

  it('rejects unknown events, unknown fields and nested metadata', () => {
    expect(parseProductEvent({ eventName: 'unknown', sessionId: 'session-123' })).toBeNull()
    expect(parseProductEvent({ eventName: 'visit', sessionId: 'session-123', source: 'private copy' })).toBeNull()
    expect(parseProductEvent({ eventName: 'visit', sessionId: 'session-123', metadata: 'private copy' })).toBeNull()
    expect(parseProductEvent({ eventName: 'analysis_completed', sessionId: 'session-123', metadata: { text: 'private copy' } })).toBeNull()
    expect(parseProductEvent({ eventName: 'analysis_completed', sessionId: 'session-123', metadata: { source: 'private copy' } })).toBeNull()
    expect(parseProductEvent({ eventName: 'analysis_completed', sessionId: 'session-123', metadata: { payload: { text: 'private copy' } } })).toBeNull()
    expect(parseProductEvent({ eventName: 'visit', sessionId: 'session-123', metadata: { campaign: 'unknown field' } })).toBeNull()
  })

  it('rejects oversized metadata', () => {
    expect(parseProductEvent({ eventName: 'visit', sessionId: 'session-123', metadata: { value: 'x'.repeat(1001) } })).toBeNull()
  })

  it('rejects non-finite numeric metadata', () => {
    expect(parseProductEvent({ eventName: 'analysis_completed', sessionId: 'session-123', metadata: { riskCount: Number.NaN } })).toBeNull()
  })
})
