/**
 * Records the live site once into HAR files, so every test run replays it offline:
 * runs are fast, give the same result each time, and don't hit GAIN's rate limiting.
 *
 *   npm run test:record            both pages
 *   npm run test:record -- blog    just one ("home" or "blog")
 *   (missing recordings are also made automatically before `npm test`)
 *
 * Each page is loaded at every test viewport and scrolled to the bottom, so the
 * responsive images (srcset picks a different file per width), the lazy-loaded images
 * and the lazy-rendered sections are all in the recording. On the blog it also pages
 * through the React list (2, 3, and a direct load of /page/2/), so React's data requests
 * are recorded too.
 * The recordings are a copy of GAIN's site, so they're gitignored rather than committed.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { HAR, HAR_BLOG, HOME, BLOG, VIEWPORTS } = require('./paths');

const TARGETS = {
  home: { url: HOME, har: HAR },
  blog: { url: BLOG, har: HAR_BLOG, extra: pageThroughBlog }
};

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

async function load(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  if (/just a moment/i.test(await page.title())) {
    throw new Error(
      'GAIN is rate limiting ("Just a moment..."). Wait a few minutes and run `npm run test:record` again.'
    );
  }
}

// Answer the consent banner (first load only), so the files Cookiebot loads AFTER consent,
// like its floating cookie-settings button, are in the recording too
async function answerCookieBanner(page) {
  const deny = page.locator('#CybotCookiebotDialog').getByRole('button', { name: 'Deny', exact: true });
  if (await deny.isVisible({ timeout: 5000 }).catch(() => false)) {
    await deny.click();
    await page
      .locator('#CookiebotWidget')
      .waitFor({ timeout: 10000 })
      .catch(() => {});
  }
}

// Blog only (desktop): page 2 and 3 through React's own pagination, then /page/2/ directly
async function pageThroughBlog(page) {
  const firstTitle = () => page.locator('[data-behaviour="listing"] .listing-box').first().textContent();
  for (const n of ['2', '3']) {
    const before = await firstTitle();
    await page.locator('.pagination').getByText(n, { exact: true }).click();
    await page.waitForFunction(
      (t) => {
        const first = document.querySelector('[data-behaviour="listing"] .listing-box');
        return first && first.textContent !== t;
      },
      before,
      { timeout: 15000 }
    );
    await scrollToBottom(page);
  }
  await load(page, BLOG + 'page/2/');
  await scrollToBottom(page);
}

async function record(name) {
  const { url, har, extra } = TARGETS[name];
  fs.mkdirSync(path.dirname(har), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ recordHar: { path: har, content: 'attach' } });
  const page = await context.newPage();
  try {
    for (const [size, { width, height }] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize({ width, height });
      await load(page, url);
      await answerCookieBanner(page);
      await scrollToBottom(page);
      await page.waitForLoadState('networkidle').catch(() => {}); // analytics may never go idle
      if (extra && size === 'desktop') await extra(page);
    }
  } finally {
    await context.close(); // the HAR is written when the context closes
    await browser.close();
  }
  console.log('Recorded ' + url + ' → ' + path.relative(process.cwd(), har));
}

/** Records the named pages (default: all), or only the missing ones with { missingOnly }. */
async function recordAll(names = Object.keys(TARGETS), { missingOnly = false } = {}) {
  for (const name of names) {
    if (missingOnly && fs.existsSync(TARGETS[name].har)) continue;
    await record(name);
  }
}

module.exports = recordAll;
if (require.main === module) {
  const names = process.argv.slice(2).filter((n) => TARGETS[n]);
  recordAll(names.length ? names : undefined).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
