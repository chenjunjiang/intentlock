import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/e'

const validBody = JSON.stringify({
  eventName: 'visit',
  sessionId: 'session-123',
  metadata: {},
})

describe('event API guardrails', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('rejects cross-origin browser requests', async () => {
    const response = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
      body: validBody,
    }))

    expect(response.status).toBe(403)
  })

  it('rejects oversized bodies before parsing event fields', async () => {
    const response = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: JSON.stringify({
        eventName: 'visit',
        sessionId: 'session-123',
        metadata: {},
        source: 'x'.repeat(5000),
      }),
    }))

    expect(response.status).toBe(400)
  })

  it('accepts normalized attribution and rejects raw campaign data', async () => {
    const validResponse = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: JSON.stringify({ eventName: 'visit', sessionId: 'session-123', metadata: { channel: 'reddit', internal: false } }),
    }))
    expect(validResponse.status).toBe(204)

    const invalidResponse = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: JSON.stringify({ eventName: 'visit', sessionId: 'session-123', metadata: { channel: 'reddit', internal: false, utmSource: 'private value' } }),
    }))
    expect(invalidResponse.status).toBe(400)
  })

  it('degrades without blocking when storage is not configured', async () => {
    const response = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: validBody,
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('x-intentlock-storage')).toBe('degraded')
  })

  it('accepts aggregate review counts without receiving writing text', async () => {
    const response = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: JSON.stringify({
        eventName: 'analysis_completed',
        sessionId: 'session-123',
        metadata: { mode: 'compare', riskCount: 0, reviewCount: 1, lockCount: 0, lengthBucket: 'short' },
      }),
    }))

    expect(response.status).toBe(204)
  })

  it('stores only an empty first-edit event and enum funnel fields', async () => {
    vi.stubEnv('INTENTLOCK_SUPABASE_URL', 'https://project.supabase.co/rest/v1')
    vi.stubEnv('INTENTLOCK_SUPABASE_SECRET_KEY', 'sb_secret_test-value')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    for (const event of [
      { eventName: 'input_edited', sessionId: 'funnel-session', metadata: {} },
      { eventName: 'analysis_completed', sessionId: 'funnel-session', metadata: { inputKind: 'custom', resultState: 'review' } },
    ]) {
      const response = await handler(new Request('https://intentlock.example/api/e', {
        method: 'POST', body: JSON.stringify(event),
      }))
      expect(response.headers.get('x-intentlock-storage')).toBe('stored')
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(String((options as RequestInit).body)))).toEqual([
      { session_id: 'funnel-session', event_name: 'input_edited', metadata: {} },
      { session_id: 'funnel-session', event_name: 'analysis_completed', metadata: { inputKind: 'custom', resultState: 'review' } },
    ])
  })

  it('sends new Supabase secret keys only through the apikey header', async () => {
    vi.stubEnv('INTENTLOCK_SUPABASE_URL', 'https://project.supabase.co/rest/v1')
    vi.stubEnv('INTENTLOCK_SUPABASE_SECRET_KEY', 'sb_secret_test-value')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: JSON.stringify({
        eventName: 'visit',
        sessionId: 'configured-session',
        metadata: {},
      }),
    }))

    expect(response.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(response.headers.get('x-intentlock-storage')).toBe('stored')
    const requestOptions = fetchMock.mock.calls[0][1] as RequestInit
    expect(requestOptions.headers).toMatchObject({ apikey: 'sb_secret_test-value' })
    expect(requestOptions.headers).not.toHaveProperty('authorization')
  })

  it('marks rate-limited events as not stored', async () => {
    vi.stubEnv('INTENTLOCK_SUPABASE_URL', 'https://project.supabase.co/rest/v1')
    vi.stubEnv('INTENTLOCK_SUPABASE_SECRET_KEY', 'sb_secret_test-value')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    let lastResponse: Response | undefined
    for (let index = 0; index < 61; index += 1) {
      lastResponse = await handler(new Request('https://intentlock.example/api/e', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.77' },
        body: JSON.stringify({ eventName: 'pricing_interest', sessionId: 'rate-test-session', metadata: { answer: 'yes', proposedMonthlyPriceUsd: 4 } }),
      }))
    }

    expect(lastResponse?.status).toBe(204)
    expect(lastResponse?.headers.get('x-intentlock-storage')).toBe('rate-limited')
    expect(fetchMock).toHaveBeenCalledTimes(60)
  })

  it('marks Supabase write failures as degraded', async () => {
    vi.stubEnv('INTENTLOCK_SUPABASE_URL', 'https://project.supabase.co/rest/v1')
    vi.stubEnv('INTENTLOCK_SUPABASE_SECRET_KEY', 'sb_secret_test-value')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    const response = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: JSON.stringify({ eventName: 'pricing_interest', sessionId: 'failed-store-session', metadata: { answer: 'yes', proposedMonthlyPriceUsd: 4 } }),
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('x-intentlock-storage')).toBe('degraded')
  })
})
