import { expect, test, type Page } from '@playwright/test'
import { parseProductEvent } from '../src/lib/event'

const browserErrors = new WeakMap<Page, string[]>()
const telemetryCounts = new WeakMap<Page, number>()
const telemetryResponses = new WeakMap<Page, number>()
const allowsDegradedPricing = new WeakSet<Page>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  telemetryCounts.set(page, 0)
  telemetryResponses.set(page, 0)
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!url.pathname.endsWith('/api/e')) return
    telemetryCounts.set(page, (telemetryCounts.get(page) ?? 0) + 1)
    if (url.pathname !== '/api/e') errors.push(`telemetry: unexpected path ${url.pathname}`)
    if (url.origin !== new URL(page.url()).origin) errors.push('telemetry: unexpected origin')
    if (request.method() !== 'POST') errors.push(`telemetry: unexpected method ${request.method()}`)
    if (request.headers().referer) errors.push('telemetry: Referer header must be omitted')
    try {
      if (!parseProductEvent(request.postDataJSON())) {
        errors.push('telemetry: event failed the production parser')
      }
    } catch {
      errors.push('telemetry: event body is not valid JSON')
    }
  })
  page.on('response', (response) => {
    if (new URL(response.url()).pathname !== '/api/e') return
    telemetryResponses.set(page, (telemetryResponses.get(page) ?? 0) + 1)
    if (response.status() !== 204) errors.push(`telemetry: unexpected response ${response.status()}`)
    const storage = response.headers()['x-intentlock-storage']
    const event = parseProductEvent(response.request().postDataJSON())
    if (storage !== 'stored' && !(allowsDegradedPricing.has(page) && event?.eventName === 'pricing_interest' && storage === 'degraded')) {
      errors.push(`telemetry: unexpected storage state ${storage ?? 'missing'}`)
    }
  })
  if (!process.env.E2E_BASE_URL) {
    await page.route('**/api/e', (route) => route.fulfill({ status: 204, headers: { 'x-intentlock-storage': 'stored' } }))
  }
  await page.addInitScript(() => {
    localStorage.setItem('intentlock_session', 'intentlock-e2e-session')
  })
})

test.afterEach(async ({ page }) => {
  expect(telemetryCounts.get(page) ?? 0).toBeGreaterThan(0)
  await expect.poll(() => telemetryResponses.get(page) ?? 0).toBe(telemetryCounts.get(page) ?? 0)
  expect(browserErrors.get(page) ?? []).toEqual([])
})

async function navigateAndWaitForVisit(page: Page, path: string, expected: { channel: string; internal: boolean }) {
  const visitResponse = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== '/api/e') return false
    const event = parseProductEvent(response.request().postDataJSON())
    return event?.eventName === 'visit'
      && event.metadata.channel === expected.channel
      && event.metadata.internal === expected.internal
  })
  await page.goto(path)
  const response = await visitResponse
  expect(response.status()).toBe(204)
  expect(response.headers()['x-intentlock-storage']).toBe('stored')
  await expect.poll(() => telemetryResponses.get(page) ?? 0).toBe(telemetryCounts.get(page) ?? 0)
  return parseProductEvent(response.request().postDataJSON())
}

test('records only normalized attribution and keeps internal marking local', async ({ page }, testInfo) => {
  const firstEvent = await navigateAndWaitForVisit(page, '/?il_internal=1&utm_source=reddit&utm_campaign=private', { channel: 'reddit', internal: true })
  expect(firstEvent?.metadata).toEqual({ channel: 'reddit', internal: true })
  expect(new URL(page.url()).searchParams.has('il_internal')).toBe(false)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('intentlock_internal'))).toBe('1')
  await page.screenshot({ path: testInfo.outputPath('attribution.png'), fullPage: true })

  const returningEvent = await navigateAndWaitForVisit(page, '/', { channel: 'direct', internal: true })
  expect(returningEvent?.metadata).toEqual({ channel: 'direct', internal: true })

  const clearedEvent = await navigateAndWaitForVisit(page, '/?il_internal=0', { channel: 'direct', internal: false })
  expect(clearedEvent?.metadata).toEqual({ channel: 'direct', internal: false })
  expect(new URL(page.url()).searchParams.has('il_internal')).toBe(false)
})

test('checks an unsafe AI rewrite from the real UI', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Did AI improve your writing')
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await expect(page.getByRole('heading', { name: /possible meaning changes/i })).toBeVisible()
  await expect(page.getByText('Permission reversal')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})

test('switches to a safe minimal grammar fix', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Minimal grammar fix' }).click()
  await page.getByRole('button', { name: 'Fix without meaning drift' }).click()
  await expect(page.getByRole('heading', { name: 'No unexplained meaning changes found' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})

test('asks for human review when important wording changes', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Original English text').fill('The system was partially effective.')
  await page.getByLabel('AI rewritten English text').fill('The system was somewhat efficient.')
  await page.getByRole('button', { name: 'Check meaning' }).click()

  await expect(page.getByRole('heading', { name: 'Wording changes need review' })).toBeVisible()
  await expect(page.getByText('Important wording changed')).toBeVisible()
  await expect(page.getByText('Check the wording')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})

test('asks for human review when the rewrite adds a number', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Original English text').fill('I have apples.')
  await page.getByLabel('AI rewritten English text').fill('I have 10 apples.')
  await page.getByRole('button', { name: 'Check meaning' }).click()

  await expect(page.getByRole('heading', { name: 'Wording changes need review' })).toBeVisible()
  await expect(page.getByText('Added: “10”')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})

test('reviews swapped roles and records anonymous funnel stages', async ({ page }, testInfo) => {
  const events: NonNullable<ReturnType<typeof parseProductEvent>>[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname !== '/api/e') return
    const event = parseProductEvent(request.postDataJSON())
    if (event) events.push(event)
  })
  await page.goto('/')
  await page.getByLabel('Original English text').fill('Alice pays Bob.')
  await page.getByLabel('AI rewritten English text').fill('Bob pays Alice.')
  await page.getByRole('button', { name: 'Check meaning' }).click()

  await expect(page.getByRole('heading', { name: 'Wording changes need review' })).toBeVisible()
  await expect.poll(() => events.filter((event) => event.eventName === 'input_edited').length).toBe(1)
  await expect.poll(() => events.find((event) => event.eventName === 'analysis_completed')?.metadata)
    .toMatchObject({ mode: 'compare', inputKind: 'custom', resultState: 'review' })
  expect(JSON.stringify(events)).not.toContain('Alice pays Bob')
  expect(JSON.stringify(events)).not.toContain('Bob pays Alice')
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})

test('reviews a changed pronoun and meaning-sensitive punctuation', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Original English text').fill('I approved it.')
  await page.getByLabel('AI rewritten English text').fill('We approved it.')
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await expect(page.getByRole('heading', { name: 'Wording changes need review' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('pronoun.png'), fullPage: true })

  await page.getByLabel('Original English text').fill('Please eat, Grandma.')
  await page.getByLabel('AI rewritten English text').fill('Please eat Grandma.')
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await expect(page.getByRole('heading', { name: 'Wording changes need review' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('punctuation.png'), fullPage: true })
})

test('clears a green result as soon as the checked writing changes', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Minimal grammar fix' }).click()
  await page.getByRole('button', { name: 'Fix without meaning drift' }).click()
  await expect(page.getByRole('heading', { name: 'No unexplained meaning changes found' })).toBeVisible()
  await page.getByLabel('Original English text').fill('New wording.')
  await expect(page.getByRole('heading', { name: 'No unexplained meaning changes found' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Copy checked text' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('after-edit.png'), fullPage: true })
})

test('accepts equivalent cautious wording', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Original English text').fill('The update may help.')
  await page.getByLabel('AI rewritten English text').fill('The update might help.')
  await page.getByRole('button', { name: 'Check meaning' }).click()

  await expect(page.getByRole('heading', { name: 'No unexplained meaning changes found' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})

test('asks for pricing interest without blocking free checks', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await expect(page.getByRole('heading', { name: /would \$4\/month feel reasonable/i })).toBeVisible()
  await page.getByRole('button', { name: 'Yes, if it works' }).click()
  await expect(page.getByText('Thanks—your answer was recorded.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check meaning' })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})

test('keeps pricing interest retryable when storage degrades', async ({ page }, testInfo) => {
  allowsDegradedPricing.add(page)
  let pricingAttempts = 0
  await page.route('**/api/e', async (route) => {
    const event = parseProductEvent(route.request().postDataJSON())
    if (event?.eventName === 'pricing_interest') pricingAttempts += 1
    if (process.env.E2E_BASE_URL && !(event?.eventName === 'pricing_interest' && pricingAttempts === 1)) {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 204,
      headers: { 'x-intentlock-storage': event?.eventName === 'pricing_interest' && pricingAttempts === 1 ? 'degraded' : 'stored' },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await page.getByRole('button', { name: 'Yes, if it works' }).click()
  await expect(page.getByRole('alert')).toHaveText('Your answer was not saved. Please try again.')
  await expect(page.getByText('Thanks—your answer was recorded.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Check meaning' })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('failure.png'), fullPage: true })
  await page.getByRole('button', { name: 'Yes, if it works' }).click()
  await expect(page.getByText('Thanks—your answer was recorded.')).toBeVisible()
  expect(pricingAttempts).toBe(2)
  await page.screenshot({ path: testInfo.outputPath('final.png'), fullPage: true })
})
