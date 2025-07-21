import { test, expect } from '@playwright/test';

// Test suite for ChecklyHQ website
// Covers critical user flows and interactions to ensure business-critical functionality

test.describe('ChecklyHQ Home Page', () => {

  test('should load home page and have correct title', async ({ page }) => {
    await page.goto('https://checklyhq.com');
    await expect(page).toHaveTitle(/Checkly/);
  });

  test('navigation bar links should be clickable and direct appropriately', async ({ page }) => {
    await page.goto('https://checklyhq.com');

    const loginLink = page.locator('nav >> text=Login');
    const startFreeLink = page.locator('nav >> text=Start for free');
    const productButton = page.locator('nav button:has-text("Product")');
    const resourcesButton = page.locator('nav button:has-text("Resources")');
    const customersLink = page.locator('nav >> text=Customers');
    const pricingLink = page.locator('nav >> text=Pricing');

    await expect(loginLink).toBeVisible();
    await expect(startFreeLink).toBeVisible();
    await expect(productButton).toBeVisible();
    await expect(resourcesButton).toBeVisible();
    await expect(customersLink).toBeVisible();
    await expect(pricingLink).toBeVisible();

    // Check navigation by clicking some links and verifying URLs
    await Promise.all([
      loginLink.click(),
      page.waitForURL('https://app.checklyhq.com/')
    ]);

    // Go back to main page
    await page.goBack();

    await Promise.all([
      startFreeLink.click(),
      page.waitForURL('https://app.checklyhq.com/signup')
    ]);
  });

  test('hero section call-to-actions should work', async ({ page }) => {
    await page.goto('https://checklyhq.com');

    const bookDemoLink = page.locator('text=Book a demo');
    const startFreeLink = page.locator('text=Start for free');

    await expect(bookDemoLink).toBeVisible();
    await expect(startFreeLink).toBeVisible();

    // Check links direct correctly
    await Promise.all([
      bookDemoLink.click(),
      page.waitForURL(/request-demo/)
    ]);

    await page.goBack();

    await Promise.all([
      startFreeLink.click(),
      page.waitForURL('https://app.checklyhq.com/signup')
    ]);
  });

  test('footer contains important links and is visible', async ({ page }) => {
    await page.goto('https://checklyhq.com');

    const productLinks = [
      'Monitoring as code',
      'Synthetic monitoring',
      'API monitoring',
      'Alerting',
      'Private locations',
      'Integrations',
      'Dashboards',
      'Live Checkly dashboard',
      'Changelog',
      'Pricing',
      'Status'
    ];

    for (const linkText of productLinks) {
      const link = page.locator(`footer >> text=${linkText}`);
      await expect(link).toBeVisible();
    }

    const companyLinks = ['About', 'Careers', 'Blog', 'Security', 'Terms of use', 'Privacy'];
    for (const linkText of companyLinks) {
      const link = page.locator(`footer >> text=${linkText}`);
      await expect(link).toBeVisible();
    }
  });

});
