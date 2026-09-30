import { describe, expect, it } from 'vitest'
import { getVisitAttribution } from '../src/lib/attribution'

describe('visit attribution', () => {
  it('prefers a known UTM source without retaining URL or query text', () => {
    expect(getVisitAttribution(
      'https://intentlock.example/?utm_source=reddit&utm_campaign=private%40example.com',
      'https://x.com/private-post?text=secret',
      false,
    )).toEqual({ channel: 'reddit', internal: false, cleanUrl: null })
  })

  it('maps known referrer hosts but not lookalike hosts', () => {
    expect(getVisitAttribution('https://intentlock.example/', 'https://out.reddit.com/post?private=1', false).channel).toBe('reddit')
    expect(getVisitAttribution('https://intentlock.example/', 'https://reddit.com.attacker.example/post', false).channel).toBe('other')
    expect(getVisitAttribution('https://intentlock.example/', 'https://t.co/redirect', false).channel).toBe('x')
  })

  it('distinguishes direct, unknown and same-origin navigation', () => {
    expect(getVisitAttribution('https://intentlock.example/', '', false).channel).toBe('direct')
    expect(getVisitAttribution('https://intentlock.example/?utm_source=private-name', '', false).channel).toBe('other')
    expect(getVisitAttribution('https://intentlock.example/?utm_source=constructor', '', false).channel).toBe('other')
    expect(getVisitAttribution('https://intentlock.example/', 'https://intentlock.example/help?private=1', false).channel).toBe('direct')
  })

  it('turns internal marking on and off and removes the control parameter', () => {
    expect(getVisitAttribution('https://intentlock.example/?il_internal=1&utm_source=x#workspace', '', false))
      .toEqual({ channel: 'x', internal: true, cleanUrl: '/?utm_source=x#workspace' })
    expect(getVisitAttribution('https://intentlock.example/?il_internal=0', '', true))
      .toEqual({ channel: 'direct', internal: false, cleanUrl: '/' })
    expect(getVisitAttribution('https://intentlock.example/', '', true).internal).toBe(true)
  })
})
