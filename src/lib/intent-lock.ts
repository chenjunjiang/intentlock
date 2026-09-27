export type Lock = {
  type: string
  icon: string
  value: string
  start: number
}

export type Risk = {
  category: string
  severity: 'High' | 'Medium'
  original: string
  explanation: string
}

export type DiffPart = {
  type: 'same' | 'add' | 'remove'
  text: string
}

const DEFINITIONS = [
  {
    type: 'Negation',
    icon: '−',
    regex: /\b(?:must not|do not|does not|did not|cannot|can't|don't|doesn't|isn't|aren't|won't|never|no longer|not)\b/gi,
  },
  {
    type: 'Numbers',
    icon: '#',
    regex: /(?:[$€£¥]\s?\d[\d,.]*|\b\d+(?:[.,]\d+)?%?|\b\d+(?:st|nd|rd|th)\b)/g,
  },
  {
    type: 'Dates & conditions',
    icon: '◷',
    regex: /\b(?:(?:before|after|until|since)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2})?|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})\b/gi,
  },
  {
    type: 'Commitment strength',
    icon: '≈',
    regex: /\b(?:may|might|could|should|expect(?:s|ed)?|aim(?:s|ed)?|likely|up to|at least)\b/gi,
  },
]

const NAME_EXCLUSIONS = new Set([
  'Please', 'The', 'This', 'That', 'These', 'Those', 'We', 'I', 'If', 'Although',
  'Because', 'Unless', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
])

function collect(regex: RegExp, text: string, type: string, icon: string): Lock[] {
  return [...text.matchAll(regex)].map((match) => ({
    type,
    icon,
    value: match[0],
    start: match.index ?? 0,
  }))
}

export function extractLocks(text: string): Lock[] {
  const locks = DEFINITIONS.flatMap((definition) =>
    collect(definition.regex, text, definition.type, definition.icon),
  )
  const names = collect(/\b[A-Z][a-z]+(?:[-'][A-Za-z]+)?\b/g, text, 'Names', 'A')
    .filter((item) => !NAME_EXCLUSIONS.has(item.value))
  const seen = new Set<string>()

  return [...locks, ...names]
    .sort((a, b) => a.start - b.start)
    .filter((item) => {
      const key = `${item.type}:${item.value.toLocaleLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function conservativeRewrite(text: string): string {
  return text
    .replace(
      /\b(may|might|could|should|must|must not|cannot|can't|don't|doesn't|do not)\s+([a-z]+)s\b/gi,
      (_, modal: string, verb: string) => `${modal} ${verb}`,
    )
    .replace(/\bWe expects\b/g, 'We expect')
    .replace(/\bWe aims\b/g, 'We aim')
    .replace(/\bI drafts\b/g, 'I draft')
    .replace(/\bThe client provide\b/g, 'The client provides')
    .replace(/\b([A-Z][a-z]+) ask\b/g, '$1 asked')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function includesNormalized(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

export function compareLocks(source: string, output: string): { locks: Lock[]; risks: Risk[] } {
  const locks = extractLocks(source)
  let risks: Risk[] = locks
    .filter((lock) => !includesNormalized(output, lock.value))
    .map((lock) => ({
      category: lock.type,
      severity: ['Negation', 'Numbers', 'Dates & conditions'].includes(lock.type) ? 'High' : 'Medium',
      original: lock.value,
      explanation: `“${lock.value}” from the original is missing or changed.`,
    }))

  const cautious = /\b(?:may|might|could|likely|expect|aim)\b/i.test(source)
  const stronger = /\b(?:will|guarantee[sd]?|certain(?:ly)?|definitely)\b/i.test(output)
  if (cautious && stronger) {
    risks = risks.filter((risk) => !/^(?:may|might|could|likely|expect|aim)$/i.test(risk.original))
    risks.push({
      category: 'Commitment strength',
      severity: 'High',
      original: source.match(/\b(?:may|might|could|likely|expect|aim)\b/i)?.[0] ?? 'cautious wording',
      explanation: 'The rewrite may turn a possibility or goal into a promise.',
    })
  }
  if (source.toLocaleLowerCase().includes('must not') && /\bcan\b/i.test(output)) {
    risks = risks.filter((risk) => risk.original.toLocaleLowerCase() !== 'must not')
    risks.push({
      category: 'Permission reversal',
      severity: 'High',
      original: 'must not',
      explanation: 'A prohibited action appears to have become allowed.',
    })
  }

  return { locks, risks }
}

export function wordDiff(source: string, output: string): DiffPart[] {
  const a = source.match(/\s+|[^\s]+/g) ?? []
  const b = output.match(/\s+|[^\s]+/g) ?? []
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
    }
  }

  const result: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (j < b.length && (i === a.length || rows[i][j + 1] >= rows[i + 1][j])) {
      result.push({ type: 'add', text: b[j] })
      j += 1
    } else {
      result.push({ type: 'remove', text: a[i] })
      i += 1
    }
  }
  return result
}
