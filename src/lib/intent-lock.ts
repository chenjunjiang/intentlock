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

export type Review = {
  category: 'Wording change'
  removed: string[]
  added: string[]
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
  'September', 'October', 'November', 'December', 'He', 'She', 'It', 'You', 'They',
])

const CAUTIOUS_MODALS = new Set(['may', 'might', 'could'])

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
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function includesNormalized(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(haystack)
}

function preservesLock(lock: Lock, output: string): boolean {
  const value = lock.value.toLocaleLowerCase()
  if (lock.type === 'Commitment strength' && CAUTIOUS_MODALS.has(value)) {
    return /\b(?:may|might|could)\b/i.test(output)
  }
  return includesNormalized(output, lock.value)
}

function normalizedText(text: string): string {
  return conservativeRewrite(text)
    .replace(/[’‘]/g, "'")
    .replace(/\b(?:may|might|could)\b/g, 'may')
}

function comparisonTokens(text: string): string[] {
  return normalizedText(text).match(/(?:[$€£¥]\s*)?\d+(?:[.,]\d+)*%?|[A-Za-z]+(?:'[A-Za-z]+)?|[^\s]/g) ?? []
}

function comparisonWords(text: string): string[] {
  return normalizedText(text).match(/(?:[$€£¥]\s*)?\d+(?:[.,]\d+)*%?|[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []
}

function unmatchedWords(source: string[], output: string[]): { removed: string[]; added: string[] } {
  const remainingOutput = [...output]
  const removed: string[] = []

  for (const word of source) {
    const index = remainingOutput.indexOf(word)
    if (index >= 0) remainingOutput.splice(index, 1)
    else removed.push(word)
  }

  return {
    removed: [...new Set(removed)],
    added: [...new Set(remainingOutput)],
  }
}

export function compareLocks(source: string, output: string): { locks: Lock[]; risks: Risk[]; reviews: Review[] } {
  const locks = extractLocks(source)
  let risks: Risk[] = locks
    .filter((lock) => !preservesLock(lock, output))
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

  const wording = unmatchedWords(comparisonWords(source), comparisonWords(output))
  const sequenceChanged = comparisonTokens(source).join('\u0000') !== comparisonTokens(output).join('\u0000')
  const reviews: Review[] = risks.length === 0 && sequenceChanged
    ? [{
        category: 'Wording change',
        removed: wording.removed,
        added: wording.added,
        explanation: wording.removed.length || wording.added.length
          ? 'IntentLock cannot verify that the removed and added wording mean the same thing.'
          : 'IntentLock cannot verify that the changed word order or punctuation preserves meaning.',
      }]
    : []

  return { locks, risks, reviews }
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
    } else if (j < b.length && (i === a.length || rows[i][j + 1] > rows[i + 1][j])) {
      result.push({ type: 'add', text: b[j] })
      j += 1
    } else {
      result.push({ type: 'remove', text: a[i] })
      i += 1
    }
  }
  return result
}
