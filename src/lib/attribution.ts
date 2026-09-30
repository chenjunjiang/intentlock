import type { VisitChannel } from './event'

const sourceAliases = new Map<string, VisitChannel>([
  ['reddit', 'reddit'],
  ['x', 'x'],
  ['twitter', 'x'],
  ['youtube', 'youtube'],
  ['tiktok', 'tiktok'],
  ['producthunt', 'product-hunt'],
  ['product-hunt', 'product-hunt'],
  ['quora', 'quora'],
  ['google', 'google'],
])

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function channelFromReferrer(referrer: string, currentOrigin: string): VisitChannel | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.origin === currentOrigin) return 'direct'
    const host = url.hostname.toLowerCase()
    if (matchesDomain(host, 'reddit.com')) return 'reddit'
    if (matchesDomain(host, 'x.com') || matchesDomain(host, 'twitter.com') || host === 't.co') return 'x'
    if (matchesDomain(host, 'youtube.com') || host === 'youtu.be') return 'youtube'
    if (matchesDomain(host, 'tiktok.com')) return 'tiktok'
    if (matchesDomain(host, 'producthunt.com')) return 'product-hunt'
    if (matchesDomain(host, 'quora.com')) return 'quora'
    if (matchesDomain(host, 'google.com')) return 'google'
  } catch {
    return 'other'
  }
  return 'other'
}

export function getVisitAttribution(href: string, referrer: string, savedInternal: boolean): {
  channel: VisitChannel
  internal: boolean
  cleanUrl: string | null
} {
  const url = new URL(href)
  const source = url.searchParams.get('utm_source')?.trim().toLowerCase()
  const channel = (source ? sourceAliases.get(source) : undefined)
    ?? channelFromReferrer(referrer, url.origin)
    ?? (source ? 'other' : 'direct')
  const control = url.searchParams.get('il_internal')
  const internal = control === '1' ? true : control === '0' ? false : savedInternal
  let cleanUrl: string | null = null
  if (url.searchParams.has('il_internal')) {
    url.searchParams.delete('il_internal')
    cleanUrl = `${url.pathname}${url.search}${url.hash}`
  }
  return { channel, internal, cleanUrl }
}
