import { expect, test } from '@playwright/test';
test('frontend reads actual API and PostgreSQL through the proxy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Подключение к системе' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('API и PostgreSQL доступны');
  await expect(page.getByText('30 самокатов')).toBeVisible();
  await page.getByRole('button', { name: 'Проверить снова' }).click();
  await expect(page.getByRole('status')).toContainText('API и PostgreSQL доступны');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `outputs/foundation-${test.info().project.name}.png`, fullPage: true });
});
test('connection failure is explained and retry recovers', async ({ page }) => {
  // Only error UI is mocked; successful flow above uses the actual backend/database.
  await page.route('**/health/ready', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('API или база данных недоступны');
  await page.unroute('**/health/ready');
  await page.getByRole('button', { name: 'Проверить снова' }).click();
  await expect(page.getByRole('status')).toContainText('API и PostgreSQL доступны');
});
