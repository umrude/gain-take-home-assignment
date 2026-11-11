/**
 * Requirements that apply to every task (the brief's instructions and the bonus).
 *   [README] = an item from the take-home checklist, [PDF] = a requirement from the brief
 *   that the checklist doesn't list, [Bonus] = a bonus item, [Extra] = beyond the brief.
 */
const vm = require('vm');
const { test, expect, source } = require('./fixtures');

const TASK_NAMES = ['questionnaire', 'drawer'];

// Use every feature once, so anything a script might fetch along the way would show up
async function useEverything(page) {
  await page.locator('.gq-section .gq-btn').click();
  for (const label of ['Conversion', 'Retail', 'Articles to read', 'Just exploring']) {
    await page.locator('.gq-question__option').filter({ hasText: label }).first().click();
    await page.locator('.gq-modal__footer__button', { hasText: 'Next' }).click();
  }
  await expect(page.locator('.gq-results__article')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.locator('.gd-tab__toggle').click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.locator('.gd-tag').nth(5).hover();
  await page.locator('.gd-tab__toggle').click();
}

test.afterEach(async ({ gain }) => {
  expect(gain.errors, 'errors from our scripts').toEqual([]);
});

test('[PDF] The JS can be pasted into the console as is (a plain script, no modules or build step)', () => {
  for (const task of TASK_NAMES) {
    const { js } = source(task);
    // Parses as a classic script, the way the console runs pasted code: no import/export
    expect(() => new vm.Script(js, { filename: task + '.js' }), task).not.toThrow();
    expect(js, task).not.toMatch(/\brequire\(|^\s*import\s|^\s*export\s/m);
  }
  // Each one runs on its own in the browser: see the other tests, which inject them separately
});

test('[PDF] The CSS is a separate file, injected into <head>; the JS adds no styles or libraries', async ({
  page,
  gain
}) => {
  await page.goto('https://www.thisisgain.com/', { waitUntil: 'load' });
  const count = () =>
    page.evaluate(() => ({
      styles: document.querySelectorAll('style, link[rel="stylesheet"]').length,
      scripts: document.querySelectorAll('script[src]').length
    }));
  for (const task of TASK_NAMES) {
    const { js, css } = source(task);
    const before = await count();
    await page.addScriptTag({ content: js }); // JS alone
    await page.waitForTimeout(500);
    const after = await count();
    expect(after.styles, `${task}.js adds no <style>/<link>`).toBe(before.styles);
    expect(after.scripts, `${task}.js loads no other scripts`).toBe(before.scripts); // (our own inline <script> has no src)
    // The CSS file is plain CSS that applies from <head>
    await page.addStyleTag({ content: css });
    expect(
      await page.evaluate((c) => [...document.head.querySelectorAll('style')].some((s) => s.textContent === c), css)
    ).toBe(true);
  }
  expect(gain.errors).toEqual([]);
});

test('[README] Safe to run more than once on the same page (no duplicate sections, drawers or cards)', async ({
  page,
  gain
}) => {
  await gain.open(TASK_NAMES);
  for (let run = 2; run <= 3; run++) for (const task of TASK_NAMES) await gain.inject(task);

  const counts = await page.evaluate(() => ({
    sections: document.querySelectorAll('.gq-section').length,
    modals: document.querySelectorAll('.gq-modal').length,
    drawers: document.querySelectorAll('.gd-drawer').length,
    overlays: document.querySelectorAll('.gd-overlay').length,
    slides: document.querySelectorAll('.gd-slide').length
  }));
  const home = await gain.readHomepage();
  expect(counts).toEqual({ sections: 1, modals: 1, drawers: 1, overlays: 1, slides: home.work.length });

  // Nothing wired up twice: if listeners were duplicated, one click would toggle twice
  await page.locator('.gd-tab__toggle').click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('gd-open'))).toBe(true);
  await page.locator('.gd-tab__toggle').click();
  await page.locator('.gq-section .gq-btn').click();
  await page.locator('.gq-question__option').first().click();
  expect(await page.locator('.gq-question__option input:checked').count()).toBe(1);

  // Re-running while things are open leaves no stray state behind
  await gain.inject('questionnaire');
  await gain.inject('drawer');
  expect(
    await page.evaluate(() => ({
      modalOpen: !document.querySelector('.gq-modal').hidden,
      htmlClasses: [...document.documentElement.classList].filter((c) => /^g[qd]-/.test(c))
    }))
  ).toEqual({ modalOpen: false, htmlClasses: [] });
});

test('[PDF] Tasks 1 and 2 read everything from the homepage: nothing is fetched', async ({ page, gain }) => {
  await gain.open(TASK_NAMES);
  await useEverything(page);
  expect(await gain.network()).toEqual([]);
});

/**
 * The real proof that nothing is hardcoded: change the homepage BEFORE the scripts run,
 * and check what they show follows the change. Hardcoded values wouldn't.
 */
async function editHomepage(page) {
  return page.evaluate(() => {
    const text = (n) => n.textContent.replace(/\s+/g, ' ').trim();
    // A renamed service in the "Solutions" menu, with a new description
    const service = [...document.querySelectorAll('.site-navigation__item')]
      .find((li) => text(li.querySelector('.site-navigation__link')) === 'Solutions')
      .querySelector('.site-navigation__submenu-link');
    const oldService = text(service.querySelector('.site-navigation__submenu-link-title'));
    service.querySelector('.site-navigation__submenu-link-title').textContent = 'Test Service';
    service.querySelector('.site-navigation__submenu-link-description').textContent = 'A test description.';
    // A new sector in "Our Sectors"
    const sectors = [...document.querySelectorAll('main p')]
      .find((p) => text(p) === 'Our Sectors')
      .closest('.wp-block-columns');
    const sectorLink = sectors.querySelector('a');
    const extra = sectorLink.closest('.wp-block-button').cloneNode(true);
    extra.querySelector('a').textContent = 'Space Travel';
    sectorLink.closest('.wp-block-button').after(extra);
    // The first case study (and its loop clones) retitled, re-linked, re-tagged
    const firstUrl = document.querySelector('.content-card__link').href;
    document.querySelectorAll('.content-card').forEach((card) => {
      const link = card.querySelector('.content-card__link');
      if (link.href !== firstUrl) return;
      link.href = 'https://www.thisisgain.com/work/test-case-study/';
      link.textContent = 'Test Case Study';
      const title = card.querySelector('.content-card__title');
      if (title) title.textContent = 'Test Case Study';
      const tags = card.querySelectorAll('.content-tags li');
      tags[0].textContent = 'Test Service';
      tags[1].textContent = 'Space Travel';
    });
    // A different footer email
    const mail = document.querySelector('footer a[href^="mailto:"]');
    mail.href = 'mailto:test@example.com';
    mail.textContent = 'test@example.com';
    // The latest Insights article re-linked
    const h2 = [...document.querySelectorAll('main h2')].find((h) => text(h) === 'Insights');
    const insights = [...document.querySelectorAll('.content-slider')].find(
      (s) => h2.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    const firstArticle = insights.querySelector('.content-card__link').href;
    insights.querySelectorAll('.content-card__link').forEach((a) => {
      if (a.href === firstArticle) a.href = 'https://www.thisisgain.com/post/test-article/';
    });
    return { oldService };
  });
}

test('[README] Task 1: Nothing is hardcoded: options, case studies, articles and the email are read from the homepage', async ({
  page,
  gain
}) => {
  await gain.open([]);
  const { oldService } = await editHomepage(page);
  await gain.inject('questionnaire');
  await page.locator('.gq-section .gq-btn').click();
  const labels = () => page.locator('.gq-question__option__label').allTextContents();
  expect(await labels()).toContain('Test Service');
  expect(await labels()).not.toContain(oldService);
  await page.locator('.gq-question__option').filter({ hasText: 'Test Service' }).click();
  await page.locator('.gq-modal__footer__button', { hasText: 'Next' }).click();
  expect(await labels()).toContain('Space Travel');
  await page.locator('.gq-question__option').filter({ hasText: 'Space Travel' }).click();
  await page.locator('.gq-modal__footer__button', { hasText: 'Next' }).click();
  await page.locator('.gq-question__option').filter({ hasText: 'Case studies like mine' }).click();
  await page.locator('.gq-modal__footer__button', { hasText: 'Next' }).click();
  await page.locator('.gq-question__option').filter({ hasText: 'Right away' }).click();
  await page.locator('.gq-modal__footer__button', { hasText: 'Next' }).click();
  const results = page.locator('.gq-results');
  await expect(results.locator('a[href^="mailto:"]')).toHaveText('test@example.com');
  await expect(results.locator('.gq-results__case-study a').first()).toHaveAttribute(
    'href',
    'https://www.thisisgain.com/work/test-case-study/'
  );
  await expect(results.locator('.gq-results__case-study').first()).toContainText(/exact/i);

  // Articles: back to question 3
  await page.locator('.gq-modal__footer__button', { hasText: 'Back' }).click();
  await page.locator('.gq-modal__footer__button', { hasText: 'Back' }).click();
  await page.locator('.gq-question__option').filter({ hasText: 'Articles to read' }).click();
  await page.locator('.gq-modal__footer__button', { hasText: 'Next' }).click();
  await page.locator('.gq-modal__footer__button', { hasText: 'Next' }).click();
  await expect(results.locator('.gq-results__article a').first()).toHaveAttribute(
    'href',
    'https://www.thisisgain.com/post/test-article/'
  );
});

test('[README] Task 2: One slide per case study, read from the "Work" slider (nothing hardcoded)', async ({
  page,
  gain
}) => {
  await gain.open([]);
  await editHomepage(page);
  await gain.inject('drawer');
  const first = page.locator('.gd-slide').first();
  await expect(first.locator('h3')).toHaveText('Test Case Study');
  await expect(first.locator('.gd-slide__link')).toHaveAttribute(
    'href',
    'https://www.thisisgain.com/work/test-case-study/'
  );
  await expect(first.locator('.gd-tag')).toHaveAttribute('data-tooltip', 'Test Service · Space Travel');
  await expect(first.locator('.gd-slide__description')).toHaveText('A test description.');
});

test('[Bonus] Works when it runs before the page has finished loading (document-start)', async ({ page, gain }) => {
  // Note whether our scripts had already started by the time the HTML was parsed
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      window.__earlyStart = { questionnaire: !!window.__gainQuestionnaire, drawer: !!window.__gainDrawer };
    });
  });
  await gain.open(TASK_NAMES, { timing: 'start' });
  expect(await page.evaluate(() => window.__earlyStart)).toEqual({ questionnaire: true, drawer: true });

  // ...and still built everything in the right place, from the real content
  const home = await gain.readHomepage();
  expect(
    await page.evaluate(() => {
      const hero = document.querySelector('main h1').closest('main > *');
      return document.querySelector('.gq-section').previousElementSibling === hero;
    })
  ).toBe(true);
  await expect(page.locator('.gd-slide')).toHaveCount(home.work.length);
  await useEverything(page);
});

test.describe('[Bonus] Animations where they improve the experience', () => {
  // [selector, pseudo-element, what moves] for every animated part
  const ANIMATED = [
    ['.gq-section', null, 'section fades up'],
    ['.gq-modal__content-wrapper', null, 'modal panel rises'],
    ['.gq-progress__item__connector', null, 'progress line fills'],
    ['.gq-question', null, 'step fades in'],
    ['.gd-drawer', null, 'drawer slides'],
    ['.gd-chevron', null, 'chevron turns'],
    ['.gd-overlay', null, 'overlay fades'],
    ['.gd-tag', '::after', 'tooltip fades/slides in'],
    ['.gd-slide', null, 'card lifts on hover']
  ];
  const timings = (page) =>
    page.evaluate(
      (list) =>
        list.map(([sel, pseudo, what]) => {
          const s = getComputedStyle(document.querySelector(sel), pseudo);
          const longest = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) || 0));
          return {
            what,
            animation: s.animationName !== 'none' ? longest(s.animationDuration) : 0,
            transition: longest(s.transitionDuration)
          };
        }),
      ANIMATED
    );

  test('every part listed has an animation or transition', async ({ page, gain }) => {
    await gain.open(TASK_NAMES);
    await page.locator('.gq-section .gq-btn').click();
    for (const t of await timings(page)) expect(t.animation + t.transition, t.what).toBeGreaterThan(0);
  });

  test.describe('[Extra] reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('with "reduce motion" switched on, they are all off', async ({ page, gain }) => {
      await gain.open(TASK_NAMES);
      await page.locator('.gq-section .gq-btn').click();
      for (const t of await timings(page)) expect(t.animation + t.transition, t.what).toBeLessThan(0.001); // under 1ms: the usual "0.01ms" reduce-motion technique counts as off
    });
  });
});
