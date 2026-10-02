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

  it.each([
    ['The system was partially effective.', 'The system was somewhat efficient.'],
    ['It should be clear.', 'It should be understood.'],
    ['I am often a little bit unsure about this plan.', 'I frequently feel uncertain about this plan.'],
  ])('sends unexplained wording changes to human review', (source, output) => {
    const result = compareLocks(source, output)

    expect(result.risks).toHaveLength(0)
    expect(result.reviews).toHaveLength(1)
    expect(result.reviews[0].removed.length).toBeGreaterThan(0)
    expect(result.reviews[0].added.length).toBeGreaterThan(0)
  })

  it('treats may and might as equivalent cautious wording', () => {
    const result = compareLocks('The update may help.', 'The update might help.')

    expect(result.risks).toHaveLength(0)
    expect(result.reviews).toHaveLength(0)
  })

  it('reviews an important word deletion without inventing an added word', () => {
    const result = compareLocks('The update may significantly help.', 'The update might help.')

    expect(result.risks).toHaveLength(0)
    expect(result.reviews[0]).toMatchObject({ removed: ['significantly'], added: [] })
  })

  it('reviews a number that only appears in the rewrite', () => {
    const result = compareLocks('I have apples.', 'I have 10 apples.')

    expect(result.risks).toHaveLength(0)
    expect(result.reviews[0]).toMatchObject({ removed: [], added: ['10'] })
  })

  it.each([
    ['Alice pays Bob.', 'Bob pays Alice.'],
    ['I approved it.', 'We approved it.'],
    ['He approved it.', 'She approved it.'],
    ['Please eat, Grandma.', 'Please eat Grandma.'],
    ['Send this to US.', 'Send this to us.'],
  ])('does not show green for changed roles, pronouns or punctuation', (source, output) => {
    const result = compareLocks(source, output)
    expect(result.risks.length + result.reviews.length).toBeGreaterThan(0)
  })

  it.each([
    ['Sam approved it.', 'Samantha approved it.', 'Sam'],
    ['We have 10 units.', 'We have 100 units.', '10'],
  ])('does not preserve a protected value inside a longer value', (source, output, value) => {
    expect(compareLocks(source, output).risks.some((risk) => risk.original === value)).toBe(true)
  })

  it('does not turn a present-tense request into a past-tense statement', () => {
    expect(conservativeRewrite('Priya ask Sam.')).toBe('Priya ask Sam.')
    expect(compareLocks('Priya ask Sam.', 'Priya asked Sam.').reviews).toHaveLength(1)
  })

  it('keeps protected terms during a minimal fix', () => {
    const source = 'Priya may approves up to $5,000 after Monday.'
    const output = conservativeRewrite(source)

    expect(output).toBe('Priya may approve up to $5,000 after Monday.')
    expect(compareLocks(source, output).reviews).toHaveLength(0)
  })

  it('returns word-level additions and removals', () => {
    const diff = wordDiff('may approve', 'will approve')
    expect(diff).toContainEqual({ type: 'remove', text: 'may' })
    expect(diff).toContainEqual({ type: 'add', text: 'will' })
  })

  it('orders a replacement as removed wording followed by added wording', () => {
    const changed = wordDiff('partially effective', 'somewhat efficient')
      .filter((part) => part.type !== 'same')

    expect(changed).toEqual([
      { type: 'remove', text: 'partially' },
      { type: 'add', text: 'somewhat' },
      { type: 'remove', text: 'effective' },
      { type: 'add', text: 'efficient' },
    ])
  })
})
