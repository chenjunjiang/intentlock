import { parseProductEvent } from '../src/lib/event.js'

export const config = { runtime: 'edge' }

const supabaseUrl = process.env.INTENTLOCK_SUPABASE_URL
const supabaseKey = process.env.INTENTLOCK_SUPABASE_SECRET_KEY

function health() {
  return {
    degraded: !supabaseUrl || !supabaseKey,
    storage: supabaseUrl && supabaseKey ? 'supabase' : 'disabled',
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

  let event
  try {
    event = parseProductEvent(await request.json())
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!event) return new Response(null, { status: 400 })

  if (!supabaseUrl || !supabaseKey) {
    console.info('intentlock_event_degraded', event.eventName)
    return new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'degraded' } })
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/intentlock_events`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
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
    console.error('intentlock_event_store_failed', event.eventName, error)
    return new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'degraded' } })
  }

  return new Response(null, { status: 204 })
}
