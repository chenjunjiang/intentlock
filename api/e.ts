import { parseProductEvent } from '../src/lib/event.js'

export const config = { runtime: 'edge' }

const MAX_BODY_BYTES = 4096
const RATE_LIMIT = 60
const RATE_WINDOW_MS = 60_000
const rateBuckets = new Map<string, number[]>()
let ingestFailures = 0

function storageConfig() {
  return {
    supabaseUrl: process.env.INTENTLOCK_SUPABASE_URL,
    supabaseKey: process.env.INTENTLOCK_SUPABASE_SECRET_KEY,
  }
}

function health() {
  const { supabaseUrl, supabaseKey } = storageConfig()
  return {
    degraded: !supabaseUrl || !supabaseKey || ingestFailures > 0,
    storage: supabaseUrl && supabaseKey ? 'supabase' : 'disabled',
    ingestFailures,
  }
}

function rateOk(key: string): boolean {
  const now = Date.now()
  const recent = (rateBuckets.get(key) ?? []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS)
  if (recent.length >= RATE_LIMIT) {
    rateBuckets.set(key, recent)
    return false
  }
  recent.push(now)
  rateBuckets.set(key, recent)
  return true
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    if (new URL(request.url).searchParams.get('health') === '1') {
      return Response.json(health(), { status: 200 })
    }
    return new Response(null, { status: 405 })
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  if (!isSameOrigin(request)) return new Response(null, { status: 403 })

  let event
  try {
    const body = await request.text()
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return new Response(null, { status: 400 })
    }
    event = parseProductEvent(JSON.parse(body))
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!event) return new Response(null, { status: 400 })
  if (!rateOk(`ip:${clientIp(request)}`) || !rateOk(`session:${event.sessionId}`)) {
    return new Response(null, { status: 204 })
  }

  const { supabaseUrl, supabaseKey } = storageConfig()
  if (!supabaseUrl || !supabaseKey) {
    console.info('intentlock_event_degraded', event.eventName)
    return new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'degraded' } })
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/intentlock_events`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        session_id: event.sessionId,
        event_name: event.eventName,
        metadata: event.metadata,
      }),
    })
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`)
  } catch (error) {
    ingestFailures += 1
    console.error('intentlock_event_store_failed', event.eventName, error)
    return new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'degraded' } })
  }

  return new Response(null, { status: 204 })
}
