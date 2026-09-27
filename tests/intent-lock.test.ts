import { describe, expect, it } from 'vitest'
import { compareLocks, conservativeRewrite, extractLocks, wordDiff } from '../src/lib/intent-lock'

describe('semantic safety rules', () => {
  it('extracts names, amounts, dates, negation and cautious wording', () => {
    const locks = extractLocks('Priya may approve up to $5,000 after Monday, but Sam must not promise it.')
    expect(locks.map(({ type, value }) => [type, value])).toEqual([
      ['Names', 'Priya'],
      ['Commitment strength', 'may'],
      ['Commitment strength', 'up to'],
      ['Numbers', '$5,000'],
      ['Dates & conditions', 'after Monday'],
      ['Names', 'Sam'],
      ['Negation', 'must not'],
    ])
  })

  it('detects missing facts and a stronger commitment', () => {
    const result = compareLocks(
      'Priya may approve up to $5,000 after Monday.',
      'Priya will approve $5,000 on Monday.',
    )
    expect(result.risks.some((risk) => risk.category === 'Commitment strength')).toBe(true)
    expect(result.risks.some((risk) => risk.original === 'up to')).toBe(true)
    expect(result.risks.some((risk) => risk.original === 'after Monday')).toBe(true)
  })

  it('flags a permission reversal', () => {
    const result = compareLocks('Sam must not promise it.', 'Sam can promise it.')
    expect(result.risks.some((risk) => risk.category === 'Permission reversal')).toBe(true)
  })

  it('keeps protected terms during a minimal fix', () => {
    expect(conservativeRewrite('Priya may approves up to $5,000 after Monday.'))
      .toBe('Priya may approve up to $5,000 after Monday.')
  })

  it('returns word-level additions and removals', () => {
    const diff = wordDiff('may approve', 'will approve')
    expect(diff).toContainEqual({ type: 'remove', text: 'may' })
    expect(diff).toContainEqual({ type: 'add', text: 'will' })
  })
})
