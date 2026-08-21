import { test, expect } from '@playwright/test'

test('app loads and shows content', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  const content = await page.content()
  expect(content.length).toBeGreaterThan(0)
})

test('GraphQL endpoint responds', async ({ request }) => {
  const response = await request.post('/graphql', {
    data: { query: '{ __typename }' },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.data.__typename).toBe('Query')
})
