export const ALLOWED_EVENTS = new Set([
  'visit',
  'analysis_completed',
  'repeat_use',
  'result_copied',
  'pricing_interest',
])

export const VISIT_CHANNELS = [
  'reddit', 'x', 'youtube', 'tiktok', 'product-hunt', 'quora', 'google', 'direct', 'other',
] as const

export type VisitChannel = typeof VISIT_CHANNELS[number]

const ALLOWED_EVENT_KEYS = new Set(['eventName', 'sessionId', 'metadata'])

const ALLOWED_METADATA_KEYS: Record<string, Set<string>> = {
  visit: new Set(['channel', 'internal']),
  analysis_completed: new Set(['mode', 'riskCount', 'reviewCount', 'lockCount', 'lengthBucket']),
  repeat_use: new Set(['checks']),
  result_copied: new Set(['mode']),
  pricing_interest: new Set(['answer', 'proposedMonthlyPriceUsd']),
}

export type ProductEvent = {
  eventName: string
  sessionId: string
  metadata: Record<string, unknown>
}

export function parseProductEvent(input: unknown): ProductEvent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const candidate = input as Record<string, unknown>
  if (!Object.keys(candidate).every((key) => ALLOWED_EVENT_KEYS.has(key))) return null
  if (typeof candidate.eventName !== 'string' || !ALLOWED_EVENTS.has(candidate.eventName)) return null
  if (typeof candidate.sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(candidate.sessionId)) return null
  if (candidate.metadata !== undefined && (
    !candidate.metadata
    || typeof candidate.metadata !== 'object'
    || Array.isArray(candidate.metadata)
  )) return null
  const metadata = (candidate.metadata ?? {}) as Record<string, unknown>
  if (JSON.stringify(metadata).length > 1000) return null
  const allowedKeys = ALLOWED_METADATA_KEYS[candidate.eventName]
  if (!Object.keys(metadata).every((key) => allowedKeys.has(key))) return null
  if (!Object.values(metadata).every((value) => {
    if (typeof value === 'number') return Number.isFinite(value)
    return typeof value === 'string' || typeof value === 'boolean'
  })) return null
  if (candidate.eventName === 'visit') {
    if ('channel' in metadata && !VISIT_CHANNELS.includes(metadata.channel as VisitChannel)) return null
    if ('internal' in metadata && typeof metadata.internal !== 'boolean') return null
  }
  return { eventName: candidate.eventName, sessionId: candidate.sessionId, metadata }
}
