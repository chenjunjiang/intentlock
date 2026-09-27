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

  it('degrades without blocking when storage is not configured', async () => {
    const response = await handler(new Request('https://intentlock.example/api/e', {
      method: 'POST',
      body: validBody,
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('x-intentlock-storage')).toBe('degraded')
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
    const requestOptions = fetchMock.mock.calls[0][1] as RequestInit
    expect(requestOptions.headers).toMatchObject({ apikey: 'sb_secret_test-value' })
    expect(requestOptions.headers).not.toHaveProperty('authorization')
  })
})
