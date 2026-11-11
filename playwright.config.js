// Playwright config for the requirement tests in tests/. See the README's "How I tested".
const { defineConfig } = require('@playwright/test');
const { VIEWPORTS } = require('./tests/paths');

module.exports = defineConfig({
  testDir: 'tests',
  globalSetup: require.resolve('./tests/global-setup'),
  fullyParallel: true,
  workers: 4,
  timeout: 45_000,
  reporter: [['list']],
  // Screenshot baselines are approved once by eye; on a machine with none yet (other OS =
  // different font rendering), they're created instead of failing.
  updateSnapshots: 'missing',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}-{platform}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: {
    browserName: 'chromium',
    viewport: VIEWPORTS.desktop,
    deviceScaleFactor: 1
  }
});
