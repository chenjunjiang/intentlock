import { expect, test, type Page } from '@playwright/test'
import { parseProductEvent } from '../src/lib/event'

const browserErrors = new WeakMap<Page, string[]>()
const telemetryCounts = new WeakMap<Page, number>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  telemetryCounts.set(page, 0)
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('request', (request) => {
    if (!new URL(request.url()).pathname.endsWith('/api/e')) return
    telemetryCounts.set(page, (telemetryCounts.get(page) ?? 0) + 1)
    try {
      if (!parseProductEvent(request.postDataJSON())) {
        errors.push('telemetry: event failed the production parser')
      }
    } catch {
      errors.push('telemetry: event body is not valid JSON')
    }
  })
  if (!process.env.E2E_BASE_URL) {
    await page.route('**/api/e', (route) => route.fulfill({ status: 204 }))
  }
  await page.addInitScript(() => {
    localStorage.setItem('intentlock_session', 'intentlock-e2e-session')
  })
})

test.afterEach(async ({ page }) => {
  expect(telemetryCounts.get(page) ?? 0).toBeGreaterThan(0)
  expect(browserErrors.get(page) ?? []).toEqual([])
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
