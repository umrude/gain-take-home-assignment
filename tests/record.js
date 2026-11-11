/**
 * Records the live homepage once into a HAR file, so every test run replays it offline:
 * runs are fast, give the same result each time, and don't hit GAIN's rate limiting.
 *
 *   npm run test:record      (also runs automatically before the first `npm test`)
 *
 * It loads the page at each test viewport and scrolls to the bottom, so the responsive
 * images (srcset picks a different file per width), the lazy-loaded images and the
 * lazy-rendered sections are all in the recording.
 * The recording is a copy of GAIN's site, so it's gitignored rather than committed.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { HAR, HOME, VIEWPORTS } = require('./paths');

async function scrollToBottom(page) {
  // Small steps, so lazy images and content-visibility sections near each step load
  for (let i = 0; i < 80; i++) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
      return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    });
    await page.waitForTimeout(150);
    if (done) break;
  }
}

async function record() {
  fs.mkdirSync(path.dirname(HAR), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ recordHar: { path: HAR, content: 'attach' } });
  const page = await context.newPage();

  for (const { width, height } of Object.values(VIEWPORTS)) {
    await page.setViewportSize({ width, height });
    await page.goto(HOME, { waitUntil: 'load' });
    if (/just a moment/i.test(await page.title())) {
      await browser.close();
      throw new Error(
        'GAIN is rate limiting ("Just a moment..."). Wait a few minutes and run `npm run test:record` again.'
      );
    }
    // Answer the consent banner (first load only), so the files Cookiebot loads AFTER
    // consent, like its floating cookie-settings button, are in the recording too
    const deny = page.locator('#CybotCookiebotDialog').getByRole('button', { name: 'Deny', exact: true });
    if (await deny.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deny.click();
      await page
        .locator('#CookiebotWidget')
        .waitFor({ timeout: 10000 })
        .catch(() => {});
    }
    await scrollToBottom(page);
    await page.waitForLoadState('networkidle').catch(() => {}); // analytics may never go idle
  }

  await context.close(); // the HAR is written when the context closes
  await browser.close();
  console.log('Recorded ' + HOME + ' → ' + path.relative(process.cwd(), HAR));
}

module.exports = record;
if (require.main === module) {
  record().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
