import { describe, expect, it } from 'vitest'
import { parseProductEvent } from '../src/lib/event'

describe('anonymous event protocol', () => {
  it('accepts only normalized visit attribution values', () => {
    const visit = { eventName: 'visit', sessionId: 'session-123', metadata: { channel: 'reddit', internal: true } }
    expect(parseProductEvent(visit)).toEqual(visit)
    expect(parseProductEvent({ ...visit, metadata: { channel: 'private-user-name', internal: false } })).toBeNull()
    expect(parseProductEvent({ ...visit, metadata: { channel: 'reddit', internal: 'false' } })).toBeNull()
    expect(parseProductEvent({ ...visit, metadata: { channel: 'reddit', internal: false, url: 'https://example.com/private' } })).toBeNull()
    expect(parseProductEvent({ eventName: 'visit', sessionId: 'session-123', metadata: {} })).not.toBeNull()
  })

  it('accepts an allowlisted aggregate event', () => {
    const event = {
      eventName: 'analysis_completed',
      sessionId: 'session-123',
      metadata: { mode: 'compare', riskCount: 2, reviewCount: 1, lockCount: 3, lengthBucket: 'short' },
    }

    expect(parseProductEvent(event)).toEqual(event)
  })

  it('accepts only anonymous funnel enums and an empty first-edit event', () => {
    const sessionId = 'session-123'
    expect(parseProductEvent({ eventName: 'input_edited', sessionId, metadata: {} })).not.toBeNull()
    expect(parseProductEvent({ eventName: 'input_edited', sessionId, metadata: { text: 'private' } })).toBeNull()
    expect(parseProductEvent({
      eventName: 'analysis_completed', sessionId,
      metadata: { mode: 'compare', inputKind: 'custom', resultState: 'review' },
    })).not.toBeNull()
    expect(parseProductEvent({ eventName: 'analysis_completed', sessionId, metadata: { inputKind: 'private' } })).toBeNull()
    expect(parseProductEvent({ eventName: 'analysis_completed', sessionId, metadata: { resultState: 'private' } })).toBeNull()
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
