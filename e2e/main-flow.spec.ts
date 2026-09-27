import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('intentlock_session', 'intentlock-e2e-session')
  })
})

test('checks an unsafe AI rewrite from the real UI', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Did AI improve your writing')
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await expect(page.getByRole('heading', { name: /possible meaning changes/i })).toBeVisible()
  await expect(page.getByText('Permission reversal')).toBeVisible()
})

test('switches to a safe minimal grammar fix', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Minimal grammar fix' }).click()
  await page.getByRole('button', { name: 'Fix without meaning drift' }).click()
  await expect(page.getByRole('heading', { name: 'No protected meaning changes found' })).toBeVisible()
})

test('asks for pricing interest without blocking free checks', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await page.getByRole('button', { name: 'Check meaning' }).click()
  await expect(page.getByRole('heading', { name: /would \$4\/month feel reasonable/i })).toBeVisible()
  await page.getByRole('button', { name: 'Yes, if it works' }).click()
  await expect(page.getByText('Thanks—your answer was recorded.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check meaning' })).toBeEnabled()
})
