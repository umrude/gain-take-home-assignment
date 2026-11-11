/**
 * Task 1: Dynamic Modal (Questionnaire).
 * Test titles quote the requirement they check:
 *   [README] = an item from the take-home checklist, [PDF] = a requirement from the brief
 *   that the checklist doesn't list, [Extra] = our own addition beyond the brief.
 * Expected results are worked out here from the brief's rules and the homepage itself
 * (readHomepage), never from the script's own logic.
 */
const { test, expect } = require('./fixtures');
const { pixelsAround, lum, dist, chroma, isBlue, isGreen } = require('./pixels');
const { VIEWPORTS } = require('./paths');

const Q3 = ['Case studies like mine', 'Articles to read', 'Talk to someone'];
const Q4 = ['Right away', 'In the next 3 months', 'Just exploring'];
const HEADINGS = {
  'Right away': 'Let’s talk this week',
  'In the next 3 months': 'Here’s where to start',
  'Just exploring': 'Take your time'
};

/* ---------------------------------------------------------------- helpers */

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
// The site's card tags and "Our Sectors" don't always match exactly ("Tech & Telcoms" vs
// "Tech & Telco"); the brief's intent is that they're the same industry.
const sameIndustry = (a, b) => norm(a).startsWith(norm(b)) || norm(b).startsWith(norm(a));

/** The brief's case-study rule, applied to the homepage's Work slider. */
function expectedCaseStudies(home, services, industries) {
  const byService = home.work.filter((w) => services.includes(w.service));
  const exact = byService.filter((w) => industries.some((i) => sameIndustry(i, w.industry)));
  const related = byService.filter((w) => !exact.includes(w));
  return [
    ...exact.map((w) => ({ url: w.url, exact: true })),
    ...related.map((w) => ({ url: w.url, exact: false }))
  ].slice(0, 3);
}

const modal = (page) => page.locator('.gq-modal__content-wrapper');
const next = (page) => page.locator('.gq-modal__footer__button', { hasText: 'Next' });
const back = (page) => page.locator('.gq-modal__footer__button', { hasText: 'Back' });
const stepTitle = (page) => page.locator('.gq-question__title');

// Wait for our entrance animations (the panel rises 16px), so positions are final
const settle = (page, selector) =>
  page.evaluate(
    (sel) =>
      Promise.all(
        document
          .querySelector(sel)
          .getAnimations({ subtree: true })
          .map((a) => a.finished)
      ),
    selector
  );

async function start(page) {
  await page.locator('.gq-section .gq-btn').click();
  await expect(modal(page)).toBeVisible();
  await settle(page, '.gq-modal');
}

// Click options by their visible label, like a user
async function pick(page, labels) {
  for (const label of [].concat(labels)) {
    await page
      .locator('.gq-question__option')
      .filter({ has: page.getByText(label, { exact: true }) })
      .click();
  }
}

/** Answer all four questions through the UI and land on the results step. */
async function answer(page, { services, industries, useful, timing }) {
  await start(page);
  for (const labels of [services, industries, useful, timing]) {
    await pick(page, labels);
    await next(page).click();
  }
  await expect(page.locator('.gq-results')).toBeVisible();
}

// What the results step shows, in on-screen order
function readResults(page) {
  return page.evaluate(() => {
    const r = document.querySelector('.gq-results');
    const t = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : null);
    return {
      heading: t(r.querySelector('.gq-results__title')),
      blocks: [...r.children].map((c) => c.className.split(' ')[0].replace('gq-results__', '')),
      emails: [...r.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href').slice(7)),
      caseStudies: [...r.querySelectorAll('.gq-results__case-study')].map((c) => ({
        url: c.querySelector('a').href,
        exact: /exact/i.test(t(c.querySelector('.gq-badge'))),
        related: /related/i.test(t(c.querySelector('.gq-badge')))
      })),
      articles: [...r.querySelectorAll('.gq-results__article')].map((a) => a.querySelector('a').href),
      empty: r.querySelector('.gq-results__empty') && {
        text: t(r.querySelector('.gq-results__empty')),
        href: r.querySelector('.gq-results__empty a').href
      }
    };
  });
}

const rgb = (css) => {
  const [r, g, b] = css.match(/\d+(\.\d+)?/g).map(Number);
  return { r, g, b };
};

test.beforeEach(async ({ gain }) => {
  await gain.open(['questionnaire']);
});
test.afterEach(async ({ gain }) => {
  expect(gain.errors, 'errors from questionnaire.js').toEqual([]);
});

/* ---------------------------------------------------------------- section + button */

test('[README] New section under the hero: header, paragraph and button', async ({ page }) => {
  const r = await page.evaluate(() => {
    const section = document.querySelector('.gq-section');
    const hero = document.querySelector('main h1').closest('main > *');
    return {
      directlyAfterHero: section.previousElementSibling === hero,
      belowHero: section.getBoundingClientRect().top >= hero.getBoundingClientRect().bottom - 1,
      heading: !!section.querySelector('h2, h3'),
      paragraph: !!section.querySelector('p'),
      buttons: section.querySelectorAll('button').length
    };
  });
  expect(r).toEqual({ directlyAfterHero: true, belowHero: true, heading: true, paragraph: true, buttons: 1 });
});

test.describe('[README] Button UI states match Figure 1 (CSS only)', () => {
  // Rendered pixels, relative to the button's border box (W × H). The dark outline is
  // drawn 3px OUTSIDE the box; the strip/shadow are the top/bottom 3px INSIDE it.
  async function sample(page) {
    const btn = page.locator('.gq-section .gq-btn');
    const { at, width: W, height: H } = await pixelsAround(page, btn);
    return {
      fill: at(8, H / 2), // left padding: no label text there
      strip: at(W / 2, 1),
      shadow: at(W / 2, H - 2),
      edgeLeft: at(-2, H / 2),
      edgeTop: at(W / 2, -2),
      corner: at(-2, -2), // the stepped notch: the outline doesn't cover the corner
      ring: at(-4.5, H / 2), // where the focus outline sits (3px offset, 2px wide)
      ringCorner: at(-4.5, -4.5),
      background: at(-10, H / 2)
    };
  }
  const away = (page) => page.mouse.move(0, 0);

  async function focusWithKeyboard(page) {
    // Focus the element just before the button, then Tab: keyboard focus (:focus-visible)
    await page.evaluate(() => {
      const p = document.querySelector('.gq-section p');
      p.tabIndex = -1;
      p.focus();
    });
    await page.keyboard.press('Tab');
    await expect(page.locator('.gq-section .gq-btn')).toBeFocused();
  }

  test('Regular: top strip lighter, bottom shadow darker, dark outline, notched corners', async ({ page }) => {
    await away(page);
    const s = await sample(page);
    expect(lum(s.strip)).toBeGreaterThan(lum(s.fill) + 10);
    expect(lum(s.shadow)).toBeLessThan(lum(s.fill) - 10);
    expect(lum(s.edgeLeft)).toBeLessThan(60);
    expect(lum(s.edgeTop)).toBeLessThan(60);
    expect(dist(s.corner, s.background)).toBeLessThan(25);
    expect(isGreen(s.fill)).toBe(true);
    expect(isBlue(s.ring)).toBe(false);
  });

  test('Hover: darker fill, strip and shadow still there', async ({ page }) => {
    await away(page);
    const regular = await sample(page);
    await page.locator('.gq-section .gq-btn').hover();
    const s = await sample(page);
    expect(lum(s.fill)).toBeLessThan(lum(regular.fill) - 5);
    expect(lum(s.strip)).toBeGreaterThan(lum(s.fill) + 10);
    expect(lum(s.shadow)).toBeLessThan(lum(s.fill) - 10);
  });

  test('Focus (keyboard): hover colours plus a square blue outline outside the dark one', async ({ page }) => {
    await away(page);
    await page.locator('.gq-section .gq-btn').hover();
    const hover = await sample(page);
    await away(page);
    await focusWithKeyboard(page);
    const s = await sample(page);
    expect(dist(s.fill, hover.fill)).toBeLessThan(10);
    expect(isBlue(s.ring)).toBe(true);
    expect(isBlue(s.ringCorner)).toBe(true); // square, unlike the notched dark outline
    expect(lum(s.edgeLeft)).toBeLessThan(60);
  });

  test('Focus by mouse click shows no blue outline (keyboard only)', async ({ page }) => {
    await page.evaluate(() => {
      const b = document.querySelector('.gq-section .gq-btn');
      b.addEventListener('click', (e) => e.stopImmediatePropagation(), { capture: true }); // don't open the modal
    });
    await page.locator('.gq-section .gq-btn').click();
    await away(page);
    expect(isBlue((await sample(page)).ring)).toBe(false);
  });

  test('Pressed: darkest fill, no top strip or bottom shadow (looks pushed in)', async ({ page }) => {
    const btn = page.locator('.gq-section .gq-btn');
    await btn.hover();
    const hover = await sample(page);
    await page.mouse.down();
    const s = await sample(page);
    await page.mouse.up();
    expect(lum(s.fill)).toBeLessThan(lum(hover.fill) - 3);
    expect(dist(s.strip, s.fill)).toBeLessThan(8);
    expect(dist(s.shadow, s.fill)).toBeLessThan(8);
    expect(lum(s.edgeLeft)).toBeLessThan(60);
  });

  test('Disabled: pale, washed-out fill and a muted outline', async ({ page }) => {
    await page.evaluate(() => (document.querySelector('.gq-section .gq-btn').disabled = true));
    await away(page);
    const s = await sample(page);
    expect(lum(s.fill)).toBeGreaterThan(200);
    expect(chroma(s.fill)).toBeLessThan(25);
    expect(lum(s.edgeLeft)).toBeGreaterThan(110); // muted, not the dark outline
    await page.locator('.gq-section .gq-btn').hover({ force: true });
    expect(dist((await sample(page)).fill, s.fill)).toBeLessThan(5); // no hover effect
  });

  test('CSS only: no images, SVGs, inline styles or JS-set classes in any state', async ({ page }) => {
    const btn = page.locator('.gq-section .gq-btn');
    const check = () =>
      btn.evaluate((b) => ({
        images: ['', '::before', '::after'].map((p) => getComputedStyle(b, p || null).backgroundImage),
        inlineStyle: b.getAttribute('style'),
        children: b.children.length, // text only: no <img>/<svg> inside
        className: b.className
      }));
    const regular = await check();
    await btn.hover();
    const hovered = await check();
    await page.mouse.down();
    const pressed = await check();
    for (const s of [regular, hovered, pressed]) {
      expect(s.images).toEqual(['none', 'none', 'none']);
      expect(s.inlineStyle).toBeNull();
      expect(s.children).toBe(0);
      expect(s.className).toBe(regular.className); // states come from CSS pseudo-classes
    }
    await page.mouse.up();
  });

  test('Screenshots of the five states (baseline approved by eye)', async ({ page }) => {
    const btn = page.locator('.gq-section .gq-btn');
    await btn.scrollIntoViewIfNeeded();
    const box = await btn.boundingBox();
    const clip = { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 };
    await away(page);
    await expect(page).toHaveScreenshot('button-regular.png', { clip });
    await btn.hover();
    await expect(page).toHaveScreenshot('button-hover.png', { clip });
    await page.mouse.down();
    await expect(page).toHaveScreenshot('button-pressed.png', { clip });
    await page.mouse.move(0, 0); // leave before releasing: no click, no modal
    await page.mouse.up();
    await focusWithKeyboard(page);
    await expect(page).toHaveScreenshot('button-focus.png', { clip });
    await page.evaluate(() => {
      document.activeElement.blur();
      document.querySelector('.gq-section .gq-btn').disabled = true;
    });
    await expect(page).toHaveScreenshot('button-disabled.png', { clip });
  });
});

/* ---------------------------------------------------------------- modal + questions */

test('[README] Button opens a modal', async ({ page }) => {
  await expect(page.locator('.gq-modal')).toBeHidden();
  await start(page);
  await expect(modal(page)).toHaveAttribute('role', 'dialog');
});

test("[README] 4 question steps + a results step (the brief's questions, in order)", async ({ page }) => {
  await start(page);
  await expect(page.locator('.gq-progress__item')).toHaveCount(5);
  const titles = [];
  for (const labels of [['Conversion'], [null], [Q3[0]], [Q4[0]]]) {
    titles.push(await stepTitle(page).textContent());
    if (labels[0]) await pick(page, labels);
    else await page.locator('.gq-question__option').first().click();
    await next(page).click();
  }
  expect(titles).toEqual([
    'What do you need help with?',
    'Which industry are you in?',
    'What would be most useful right now?',
    'When are you looking to start?'
  ]);
  await expect(page.locator('.gq-results')).toBeVisible();
});

test('[README] Service options match the "Solutions" menu and industry options match "Our Sectors"', async ({
  page,
  gain
}) => {
  const home = await gain.readHomepage();
  await start(page);
  const labels = () => page.locator('.gq-question__option__label').allTextContents();
  expect(await labels()).toEqual(home.services.map((s) => s.name));
  await pick(page, home.services[0].name);
  await next(page).click();
  expect(await labels()).toEqual(home.sectors);
});

test("[PDF] Questions 3 and 4 offer exactly the brief's options", async ({ page }) => {
  await start(page);
  for (const labels of ['Conversion', 'Retail']) {
    await pick(page, labels);
    await next(page).click();
  }
  expect(await page.locator('.gq-question__option__label').allTextContents()).toEqual(Q3);
  await pick(page, Q3[0]);
  await next(page).click();
  expect(await page.locator('.gq-question__option__label').allTextContents()).toEqual(Q4);
});

test('[README] Questions 1 and 2 allow more than one answer, questions 3 and 4 allow one', async ({ page }) => {
  await start(page);
  const checked = () => page.locator('.gq-question__option input:checked').count();
  // Q1, Q2: two picks stay picked
  for (const two of [
    ['Conversion', 'Experience'],
    ['Retail', 'Finance']
  ]) {
    await pick(page, two);
    expect(await checked()).toBe(2);
    await next(page).click();
  }
  // Q3, Q4: picking a second replaces the first
  for (const [a, b] of [Q3.slice(0, 2), Q4.slice(0, 2)]) {
    await pick(page, [a, b]);
    expect(await checked()).toBe(1);
    await expect(page.locator('.gq-question__option').filter({ hasText: b }).locator('input')).toBeChecked();
    await next(page).click();
  }
});

test("[README] Can't go to the next step until the current one is answered", async ({ page }) => {
  await start(page);
  await expect(next(page)).toBeDisabled();
  await pick(page, 'Conversion');
  await expect(next(page)).toBeEnabled();
  await pick(page, 'Conversion'); // untick: nothing picked again
  await expect(next(page)).toBeDisabled();
  // Even with `disabled` removed in DevTools, Next must not skip the question
  await next(page).evaluate((b) => (b.disabled = false));
  await next(page).click();
  await expect(stepTitle(page)).toHaveText('What do you need help with?');
});

/* ---------------------------------------------------------------- results */

test.describe('[README] Results heading changes with question 4, and content changes with question 3', () => {
  for (const useful of Q3) {
    for (const timing of Q4) {
      test(`${useful} + ${timing}`, async ({ page, gain }) => {
        const home = await gain.readHomepage();
        const first = home.work[0];
        await answer(page, {
          services: first.service,
          industries: home.sectors.find((s) => sameIndustry(s, first.industry)),
          useful,
          timing
        });
        const r = await readResults(page);

        expect(r.heading).toBe(HEADINGS[timing]);

        // [README] "Right away" always shows the email at the top (only once with "Talk to someone")
        const showsEmail = timing === 'Right away' || useful === 'Talk to someone';
        expect(r.emails).toEqual(showsEmail ? [home.email] : []);
        if (showsEmail) expect(r.blocks.slice(0, 2)).toEqual(['title', 'email']);

        // Main content from question 3
        const wantsCases = useful === 'Case studies like mine';
        // [README] "Talk to someone" + "Just exploring" also shows the 3 latest articles
        const wantsArticles =
          useful === 'Articles to read' || (useful === 'Talk to someone' && timing === 'Just exploring');
        expect(r.caseStudies.length > 0 || !!r.empty).toBe(wantsCases);
        expect(r.articles).toEqual(wantsArticles ? home.insights.slice(0, 3).map((a) => a.url) : []);
        if (useful === 'Talk to someone' && wantsArticles) {
          expect(r.blocks.indexOf('articles')).toBeGreaterThan(r.blocks.indexOf('email')); // "under the email"
        }
      });
    }
  }
});

test('[README] Exact matches first, topped up with labelled related ones (max 3, in slider order)', async ({
  page,
  gain
}) => {
  test.setTimeout(90_000);
  const home = await gain.readHomepage();
  const allServices = home.services.map((s) => s.name);
  const first = home.work[0];
  const sector = (industry) => home.sectors.find((s) => sameIndustry(s, industry));
  // A sector with no case study for this service → only "related" ones
  const noMatch = home.sectors.find(
    (s) => !home.work.some((w) => w.service === first.service && sameIndustry(s, w.industry))
  );
  // A card whose tag isn't spelled like its sector (e.g. "Tech & Telcoms" vs "Tech & Telco")
  const misspelt = home.work.find((w) => !home.sectors.includes(w.industry));

  const cases = [
    { name: 'everything picked: first 3 in slider order, all exact', services: allServices, industries: home.sectors },
    { name: 'one exact, topped up with related', services: [first.service], industries: [sector(first.industry)] },
    { name: 'no exact: related only', services: [first.service], industries: [noMatch] },
    misspelt && {
      name: `tag "${misspelt.industry}" matches its sector`,
      services: [misspelt.service],
      industries: [sector(misspelt.industry)]
    }
  ].filter(Boolean);

  for (const c of cases) {
    await page.goto('about:blank');
    await gain.open(['questionnaire']);
    await answer(page, { services: c.services, industries: c.industries, useful: Q3[0], timing: Q4[1] });
    const r = await readResults(page);
    const want = expectedCaseStudies(home, c.services, c.industries);
    expect(
      r.caseStudies.map((x) => x.url),
      c.name
    ).toEqual(want.map((x) => x.url));
    expect(
      r.caseStudies.map((x) => x.exact),
      c.name + ' (exact labels)'
    ).toEqual(want.map((x) => x.exact));
    expect(
      r.caseStudies.map((x) => x.related),
      c.name + ' (related labels)'
    ).toEqual(want.map((x) => !x.exact));
    expect(r.caseStudies.length).toBeLessThanOrEqual(3);
  }
});

test('[README] …plus the "none" message (links to /work/)', async ({ page }) => {
  // Every service on the live site has a case study, so "none" can't happen with real data;
  // empty the scraped list (the debug handle) to exercise the message.
  await page.evaluate(() => (window.__gainQuestionnaire.data.caseStudies = []));
  await answer(page, { services: 'Conversion', industries: 'Retail', useful: Q3[0], timing: Q4[2] });
  const r = await readResults(page);
  expect(r.caseStudies).toEqual([]);
  expect(r.empty.href).toBe('https://www.thisisgain.com/work/');
});

test('[README] Case studies and articles link to their real pages', async ({ page, gain }) => {
  const home = await gain.readHomepage();
  await answer(page, {
    services: home.services.map((s) => s.name),
    industries: home.sectors,
    useful: Q3[0],
    timing: Q4[0]
  });
  const cs = await readResults(page);
  const workUrls = home.work.map((w) => w.url);
  for (const c of cs.caseStudies) expect(workUrls).toContain(c.url);

  await page.goto('about:blank');
  await gain.open(['questionnaire']);
  await answer(page, { services: 'Conversion', industries: 'Retail', useful: Q3[1], timing: Q4[0] });
  expect((await readResults(page)).articles).toEqual(home.insights.slice(0, 3).map((a) => a.url));
});

test('[PDF] The email comes from the site footer', async ({ page, gain }) => {
  const home = await gain.readHomepage();
  expect(home.email).toMatch(/@/);
  await answer(page, { services: 'Conversion', industries: 'Retail', useful: Q3[2], timing: Q4[1] });
  await expect(page.locator('.gq-results a[href^="mailto:"]')).toHaveText(home.email);
});

test('[README] Summary of the question 1 and 2 picks, with a way to go back and change them', async ({ page }) => {
  await answer(page, { services: ['Conversion', 'Experience'], industries: 'Retail', useful: Q3[0], timing: Q4[1] });
  const summary = page.locator('.gq-results__summary');
  await expect(summary).toContainText('Conversion');
  await expect(summary).toContainText('Experience');
  await expect(summary).toContainText('Retail');
  await summary.getByRole('button', { name: /change industries/i }).click();
  await expect(stepTitle(page)).toHaveText('Which industry are you in?');
  await expect(
    page
      .locator('.gq-question__option')
      .filter({ hasText: /^Retail$/ })
      .locator('input')
  ).toBeChecked();
});

test('[README] Can go back, change an answer, and the results update', async ({ page, gain }) => {
  const home = await gain.readHomepage();
  const first = home.work[0];
  const firstSector = home.sectors.find((s) => sameIndustry(s, first.industry));
  await answer(page, { services: first.service, industries: firstSector, useful: Q3[0], timing: Q4[0] });
  expect((await readResults(page)).heading).toBe(HEADINGS['Right away']);

  // Back twice: change Q4 and Q3
  await back(page).click();
  await pick(page, 'Just exploring');
  await back(page).click();
  await pick(page, 'Articles to read');
  await next(page).click();
  await expect(
    page.locator('.gq-question__option').filter({ hasText: 'Just exploring' }).locator('input')
  ).toBeChecked();
  await next(page).click();
  let r = await readResults(page);
  expect(r.heading).toBe(HEADINGS['Just exploring']);
  expect(r.caseStudies).toEqual([]);
  expect(r.articles).toHaveLength(3);

  // Change services from the summary: results follow the new pick
  const other = home.services.find((s) => s.name !== first.service).name;
  await page.getByRole('button', { name: /change services/i }).click();
  await pick(page, [first.service, other]); // untick the old one, tick a new one
  for (let i = 0; i < 4; i++) await next(page).click(); // the later answers are kept
  await expect(page.locator('.gq-results__summary')).toContainText(other);
});

/* ---------------------------------------------------------------- progress bar */

test('[README] Progress bar with active (blue, bold), completed (blue + green checkmark) and next (white) states', async ({
  page
}) => {
  await start(page);
  await pick(page, 'Conversion');
  await next(page).click(); // now on step 2
  await page.waitForTimeout(600); // let the colour/connector transitions finish

  const items = await page.locator('.gq-progress__item').evaluateAll((els) =>
    els
      .map((el) => {
        const label = el.querySelector('.gq-progress__item__label');
        return {
          state: (el.className.match(/--(complete|active|next)/) || [])[1],
          circle: getComputedStyle(el, '::before').backgroundColor,
          check: getComputedStyle(el, '::after'),
          labelColor: getComputedStyle(label).color,
          labelWeight: Number(getComputedStyle(label).fontWeight)
        };
      })
      .map((x) => ({ ...x, check: { content: x.check.content, bg: x.check.backgroundColor } }))
  );
  const [done, active, ...upcoming] = items;

  expect(done.state).toBe('complete');
  expect(isBlue(rgb(done.circle))).toBe(true); // "the progress stays blue"
  expect(done.check.content).toMatch(/✓|\\2713/); // "gets a green checkmark"
  expect(isGreen(rgb(done.check.bg))).toBe(true);

  expect(active.state).toBe('active');
  expect(isBlue(rgb(active.circle))).toBe(true); // "blue active state"
  expect(active.labelWeight).toBeGreaterThanOrEqual(700); // "and bold text"
  expect(isBlue(rgb(active.labelColor))).toBe(true); // Figure 2: blue label
  expect(active.check.content).toBe('none');

  for (const n of upcoming) {
    expect(n.state).toBe('next');
    expect(n.circle).toBe('rgb(255, 255, 255)'); // "the next step will have a white background"
    expect(n.labelWeight).toBeLessThan(700);
  }
  // Figure 2: the line into the active step is blue, the line after it isn't
  const line = async (i) => {
    const conn = page.locator('.gq-progress__item__connector').nth(i);
    const { at, width, height } = await pixelsAround(page, conn, 0);
    return at(width / 2, height / 2);
  };
  expect(isBlue(await line(0))).toBe(true);
  expect(isBlue(await line(1))).toBe(false);
  await expect(page.locator('.gq-progress')).toHaveScreenshot('progress-step-2.png');
});

/* ---------------------------------------------------------------- layout */

test('[README] Uses Flex or Grid CSS', async ({ page, gain }) => {
  const home = await gain.readHomepage();
  await answer(page, {
    services: home.services.map((s) => s.name),
    industries: home.sectors,
    useful: Q3[0],
    timing: Q4[0]
  });
  const layout = await page.evaluate(() => {
    const containers = [
      '.gq-section__inner',
      '.gq-modal',
      '.gq-modal__content-wrapper',
      '.gq-modal__footer',
      '.gq-progress',
      '.gq-progress__item',
      '.gq-results',
      '.gq-results__case-studies',
      '.gq-results__summary__row'
    ].map((s) => [s, getComputedStyle(document.querySelector(s)).display]);
    const ours = [...document.querySelectorAll('[data-gain="gq"], [data-gain="gq"] *')];
    return {
      containers,
      floats: ours.filter((e) => getComputedStyle(e).float !== 'none').length,
      tables: ours.filter((e) => getComputedStyle(e).display.startsWith('table')).length
    };
  });
  for (const [selector, display] of layout.containers) expect(display, selector).toMatch(/^(inline-)?(flex|grid)$/);
  expect(layout.floats).toBe(0);
  expect(layout.tables).toBe(0);
});

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`[README] Works on desktop, tablet and mobile (down to 375px): ${name} ${viewport.width}px`, async ({
    page,
    gain
  }) => {
    await page.setViewportSize(viewport);
    const home = await gain.readHomepage();
    const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
    const before = await pageWidth();
    const inView = async (locator, label) => {
      const b = await locator.boundingBox();
      expect(b, label).not.toBeNull();
      expect(b.x, label).toBeGreaterThanOrEqual(-0.5);
      expect(b.y, label).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width, label).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(b.y + b.height, label).toBeLessThanOrEqual(viewport.height + 0.5);
    };

    // The section doesn't overflow, and the page gets no wider because of it
    expect(await page.locator('.gq-section').evaluate((s) => s.scrollWidth <= s.clientWidth)).toBe(true);
    expect(await pageWidth()).toBeLessThanOrEqual(Math.max(before, viewport.width));

    // Every step: the panel and the Back/Next buttons are fully on screen
    await start(page);
    await inView(modal(page), 'modal on step 1');
    for (const [i, labels] of [home.services.map((s) => s.name), home.sectors, Q3[0], Q4[0]].entries()) {
      await pick(page, labels);
      await inView(next(page), `Next on step ${i + 1}`);
      if (i) await inView(back(page), `Back on step ${i + 1}`);
      await next(page).click();
    }
    await inView(modal(page), 'modal on results');
    await inView(back(page), 'Back on results');
    expect(await modal(page).evaluate((m) => m.scrollWidth <= m.clientWidth + 1)).toBe(true);
  });
}
