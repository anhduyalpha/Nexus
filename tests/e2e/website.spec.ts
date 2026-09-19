import { test, expect } from '@playwright/test';
test('desktop: create a real QR, download and see it in the library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Everyday tasks/ })).toBeVisible();
  await page.getByRole('button', { name: /QR generator.*Turn text/ }).click();
  await page.getByLabel('Text or link').fill('https://example.com/nexus');
  await page.getByRole('button', { name: 'Generate QR code' }).click();
  await expect(page.getByText('Saved to your library')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('qr-code.png');
  await page.getByRole('button', { name: /My files/ }).click();
  await expect(page.getByText('qr-code.png').first()).toBeVisible();
});
test('mobile: navigation and QR form have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Everyday tasks/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: /QR generator.*Turn text/ }).click();
  await expect(page.getByLabel('Text or link')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
