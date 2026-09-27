export const ALLOWED_EVENTS = new Set([
  'visit',
  'analysis_completed',
  'repeat_use',
  'result_copied',
  'pricing_interest',
])

const ALLOWED_METADATA_KEYS: Record<string, Set<string>> = {
  visit: new Set(),
  analysis_completed: new Set(['mode', 'riskCount', 'lockCount', 'lengthBucket']),
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
  if (!input || typeof input !== 'object') return null
  const candidate = input as Record<string, unknown>
  if (typeof candidate.eventName !== 'string' || !ALLOWED_EVENTS.has(candidate.eventName)) return null
  if (typeof candidate.sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(candidate.sessionId)) return null
  const metadata = candidate.metadata && typeof candidate.metadata === 'object'
    ? candidate.metadata as Record<string, unknown>
    : {}
  if (JSON.stringify(metadata).length > 1000) return null
  const allowedKeys = ALLOWED_METADATA_KEYS[candidate.eventName]
  if (!Object.keys(metadata).every((key) => allowedKeys.has(key))) return null
  if (!Object.values(metadata).every((value) => ['string', 'number', 'boolean'].includes(typeof value))) return null
  return { eventName: candidate.eventName, sessionId: candidate.sessionId, metadata }
}
