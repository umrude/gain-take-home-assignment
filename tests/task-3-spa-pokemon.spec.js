/**
 * Task 3: SPA DOM Manipulation (Pokémon), on the recorded blog.
 * Test titles quote the requirement they check:
 *   [README] = an item from the take-home checklist, [PDF] = a requirement from the brief
 *   that the checklist doesn't list, [Bonus] = a bonus item, [Extra] = beyond the brief.
 * PokeAPI is the fake one from fixtures.js: expected names and types come from
 * fakePokemon / fakeTypes, never from pokemon.js. Paging uses the site's real React
 * pagination, replayed from the recording (pages 1–3).
 */
const { test, expect, source, fakeTypes, fakeCry } = require('./fixtures');
const { VIEWPORTS } = require('./paths');

test.use({ site: 'blog' });

const PER_PAGE = 12; // the brief: "there are 12 cards per page"
const TYPES =
  'normal fire water electric grass ice fighting poison ground flying psychic bug rock ghost dragon dark steel fairy';
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const idsOnPage = (n) => range((n - 1) * PER_PAGE + 1, n * PER_PAGE);
const capitalise = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/* ---------------------------------------------------------------- helpers */

const CARDS = '[data-behaviour="listing"] .listing-box';

/** Wait until React's list shows page `n` and every card has its Pokémon (or error card). */
async function pageReady(page, n) {
  await page.waitForFunction(
    ({ first, sel }) => {
      const cards = [...document.querySelectorAll(sel)];
      return (
        cards.length > 0 &&
        cards[0].getAttribute('data-gp-id') === String(first) &&
        cards.every((c) => c.hasAttribute('data-gp-ready'))
      );
    },
    { first: (n - 1) * PER_PAGE + 1, sel: CARDS }
  );
}

/** Click a page number in the site's own (React) pagination */
async function goToPage(page, n) {
  await page.locator('.pagination').getByText(String(n), { exact: true }).click();
  await pageReady(page, n);
}

/** What each card shows, read from the page */
const cards = (page) =>
  page.evaluate((sel) => {
    const text = (n) => (n ? n.textContent.trim() : '');
    return [...document.querySelectorAll(sel)].map((li) => {
      const card = li.querySelector(':scope > .gp-card');
      return {
        id: Number(li.getAttribute('data-gp-id')),
        visible: li.checkVisibility(),
        number: text(card && card.querySelector('.gp-card__number')),
        name: text(card && card.querySelector('.gp-card__name')),
        image: card && card.querySelector('.gp-card__image') ? card.querySelector('.gp-card__image').src : '',
        types: card ? [...card.querySelectorAll('.gp-card__types li')].map(text) : [],
        flipped: !!(card && card.classList.contains('gp-card--flipped')),
        error: !!(card && card.classList.contains('gp-card--error'))
      };
    });
  }, CARDS);
const visibleIds = async (page) => (await cards(page)).filter((c) => c.visible).map((c) => c.id);

const typeFilter = (page) => page.locator('.gp-type-filter');
const pickType = (page, type) => typeFilter(page).selectOption(type);
const emptyMessage = (page) => page.locator('.gp-empty');

test.beforeEach(async ({ page }) => {
  // Every test starts with no type chosen (sessionStorage is per tab, but be explicit)
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('gp-type');
    } catch (e) {}
  });
});

test.afterEach(async ({ gain }) => {
  expect(gain.errors, 'errors from our scripts').toEqual([]);
});

/* ---------------------------------------------------------------- cards */

test('[README] Every article card shows a Pokémon (image, name, types) based on its position', async ({
  page,
  gain
}) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const shown = await cards(page);
  expect(shown.map((c) => c.id)).toEqual(idsOnPage(1));
  for (const c of shown) {
    expect(c.visible, `#${c.id} visible`).toBe(true);
    expect(c.name).toBe('Testmon-' + c.id); // its name as the title
    expect(c.number).toBe('#' + String(c.id).padStart(4, '0'));
    expect(c.image).toContain(encodeURIComponent(`id="art-${c.id}"`)); // its own artwork
    expect(c.types.map((t) => t.toLowerCase())).toEqual(fakeTypes(c.id)); // its types as the tags
  }
});

test('[PDF] The article content is replaced: none of it is visible, and the cards are not links', async ({
  page,
  gain
}) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const leftovers = await page.evaluate((sel) => {
    const visible = [];
    document.querySelectorAll(sel).forEach((li) => {
      [...li.children].forEach((child) => {
        if (!child.classList.contains('gp-card') && child.checkVisibility()) visible.push(child.outerHTML.slice(0, 80));
      });
      if (li.querySelector('.gp-card').closest('a')) visible.push('card inside a link');
    });
    return visible;
  }, CARDS);
  expect(leftovers).toEqual([]);
});

test('[PDF] Clicking a card no longer opens the article', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const url = page.url();
  let navigated = false;
  page.on('framenavigated', (f) => f === page.mainFrame() && (navigated = true));
  await page.locator('.gp-card').nth(2).click();
  await page.waitForTimeout(800);
  expect(navigated).toBe(false);
  expect(page.url()).toBe(url);
});

test('[README] Pokémon numbers follow the page (page 2 starts at #13)', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await goToPage(page, 2);
  expect((await cards(page)).map((c) => c.id)).toEqual(idsOnPage(2)); // #13–#24
  expect((await cards(page))[0].name).toBe('Testmon-13');
  await goToPage(page, 3);
  expect((await cards(page)).map((c) => c.id)).toEqual(idsOnPage(3));
  await goToPage(page, 1);
  expect((await cards(page)).map((c) => c.id)).toEqual(idsOnPage(1));
  // The browser's back and forward buttons too (React redraws, no reload)
  await page.goBack();
  await pageReady(page, 3);
  await page.goForward();
  await pageReady(page, 1);
});

test('[PDF] Opening a later page directly (/blog/page/2/) starts at #13 too', async ({ page, gain }) => {
  await gain.open(['pokemon'], { url: 'https://www.thisisgain.com/blog/page/2/' });
  await pageReady(page, 2);
  expect((await cards(page)).map((c) => c.id)).toEqual(idsOnPage(2));
});

/* ---------------------------------------------------------------- no flash */

test('[README] No article content flashes before the Pokémon appear (paging and filtering too)', async ({
  page,
  gain,
  pokeapi
}) => {
  pokeapi.delay = 400; // a slow PokeAPI: a wide window for anything to flash
  // Every frame, from before the page exists, note any article content (or React dropdown)
  // that is visible. The CSS goes in at document-start, like an A/B tool's.
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const seen = new Set();
    window.__flashes = seen;
    (function sample() {
      document.querySelectorAll('[data-behaviour="listing"] .listing-box').forEach((li) => {
        [...li.children].forEach((child) => {
          if (!child.classList.contains('gp-card') && child.checkVisibility({ visibilityProperty: true }))
            seen.add(location.pathname + ': ' + child.textContent.replace(/\s+/g, ' ').trim().slice(0, 50));
        });
      });
      document
        .querySelectorAll('select[name="post_tag"], select[name="capability"]')
        .forEach((s) => s.checkVisibility() && seen.add('React dropdown ' + s.name));
      requestAnimationFrame(sample);
    })();
  });
  await gain.open(['pokemon'], { timing: 'start' });
  await pageReady(page, 1);
  await goToPage(page, 2);
  await pickType(page, 'fire');
  await goToPage(page, 3);
  await pickType(page, '');
  await goToPage(page, 1);
  await page.goBack();
  await pageReady(page, 3);
  expect([...(await page.evaluate(() => [...window.__flashes]))]).toEqual([]);
});

/* ---------------------------------------------------------------- filter */

test('[README] "Filter by Tags" hidden, and "Filter by type" lists the 18 regular types', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await expect(page.locator('select[name="post_tag"]')).toBeHidden();
  // "Turn the capability dropdown into Filter by type": React's is hidden, ours takes its place
  await expect(page.locator('select[name="capability"]')).toBeHidden();
  await expect(typeFilter(page)).toHaveCount(1);
  await expect(typeFilter(page)).toBeVisible();
  await expect(typeFilter(page)).toHaveAccessibleName('Filter by type');
  expect(
    await page.evaluate(() => document.querySelector('select[name="capability"]').nextElementSibling.className)
  ).toBe('gp-type-filter');

  const options = await typeFilter(page)
    .locator('option')
    .evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
  expect(options[0]).toEqual(['', 'Filter by type']); // the placeholder, like the site's
  expect(options.slice(1)).toEqual(TYPES.split(' ').map((t) => [t, capitalise(t)]));
});

test('[README] "Filter by type" filters the current page only, with an empty message', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  // React's own filter request (the capability dropdown's onChange) must never be sent
  const reactRequests = [];
  page.on('request', (r) => r.url().includes('admin-ajax.php') && reactRequests.push(r.url()));

  await pickType(page, 'fire');
  const fire = idsOnPage(1).filter((id) => fakeTypes(id).includes('fire'));
  expect(await visibleIds(page)).toEqual(fire);
  await expect(emptyMessage(page)).toBeHidden();

  // A dual type matches on either type
  await pickType(page, 'poison');
  expect(await visibleIds(page)).toEqual(idsOnPage(1).filter((id) => fakeTypes(id).includes('poison')));

  // None of this type on the page: a short message, where the cards were (above the page numbers)
  await pickType(page, 'dragon');
  expect(await visibleIds(page)).toEqual([]);
  await expect(emptyMessage(page)).toBeVisible();
  await expect(emptyMessage(page)).toHaveText(/Dragon/);
  expect(
    await page.evaluate(() => {
      const ul = document.querySelector('[data-behaviour="listing"] > ul');
      const msg = document.querySelector('.gp-empty');
      const nav = document.querySelector('.pagination');
      return ul.nextElementSibling === msg && !!(msg.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING);
    })
  ).toBe(true);

  // Back to "Filter by type": every card again
  await pickType(page, '');
  expect(await visibleIds(page)).toEqual(idsOnPage(1));
  await expect(emptyMessage(page)).toBeHidden();
  expect(reactRequests, 'React was not asked to filter').toEqual([]);
  expect(page.url()).toBe('https://www.thisisgain.com/blog/');
});

test('[README] The chosen type stays selected when changing pages', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await pickType(page, 'fire');
  for (const n of [2, 3, 1]) {
    await goToPage(page, n);
    await expect(typeFilter(page)).toHaveValue('fire');
    expect(await visibleIds(page), `page ${n}`).toEqual(idsOnPage(n).filter((id) => fakeTypes(id).includes('fire')));
  }
  // A page with none of the type shows the message, still with the type selected
  await pickType(page, 'dragon');
  await goToPage(page, 2);
  await expect(typeFilter(page)).toHaveValue('dragon');
  await expect(emptyMessage(page)).toBeVisible();
  await page.goBack();
  await pageReady(page, 1);
  await expect(typeFilter(page)).toHaveValue('dragon');
  await expect(emptyMessage(page)).toBeVisible();
});

/* ---------------------------------------------------------------- flip */

const flippedIds = async (page) => (await cards(page)).filter((c) => c.flipped).map((c) => c.id);
/** The card really turned: its inner element is rotated (read once the transition is done) */
const isTurned = (page, i) =>
  page
    .locator('.gp-card__inner')
    .nth(i)
    .evaluate(async (inner) => {
      await Promise.all(inner.getAnimations().map((a) => a.finished.catch(() => {})));
      const m = new DOMMatrix(getComputedStyle(inner).transform);
      return m.m11 < -0.99; // rotateY(180deg): the x axis points the other way
    });

test('[README] Clicking a Pokémon card flips it to show more details', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const card = page.locator('.gp-card').first();
  await expect(card).toHaveAttribute('role', 'button');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  expect(await isTurned(page, 0)).toBe(true);
  // The back has the details: facts and base stats
  await expect(card.locator('.gp-card__back')).toContainText('Swift Swim');
  await expect(card.locator('.gp-stat')).toHaveCount(6);
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  expect(await isTurned(page, 0)).toBe(false);
});

test('[README] The flip still works after paging or filtering', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await goToPage(page, 2);
  await page.locator('.gp-card').first().click();
  expect(await isTurned(page, 0)).toBe(true);

  await pickType(page, 'water');
  const firstWater = (await cards(page)).findIndex((c) => c.visible);
  await page.locator('.gp-card').nth(firstWater).click();
  expect(await isTurned(page, firstWater)).toBe(true);
  await pickType(page, '');
  await goToPage(page, 1);
  await page.locator('.gp-card').nth(5).click();
  expect(await isTurned(page, 5)).toBe(true);
});

test('[Extra] Keyboard: Enter and Space flip a focused card, without scrolling the page', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const card = page.locator('.gp-card').first();
  await card.focus();
  const y = await page.evaluate(() => scrollY);
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => scrollY)).toBe(y);
});

test('[Extra] Flipped cards are remembered when paging away and back', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await page.locator('.gp-card').nth(2).click();
  await page.locator('.gp-card').nth(3).click();
  await pickType(page, 'fire'); // filtering keeps them too (it only hides cards)
  await pickType(page, '');
  expect(await flippedIds(page)).toEqual([3, 4]);
  await goToPage(page, 2);
  expect(await flippedIds(page)).toEqual([]);
  await goToPage(page, 1);
  expect(await flippedIds(page)).toEqual([3, 4]);
  await expect(page.locator('.gp-card').nth(2)).toHaveAttribute('aria-pressed', 'true');
});

test('[Bonus] Flipping a card to its back plays the Pokémon’s cry', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  // Swap the browser's Audio for a stub that notes what would play (headless has no speakers)
  await page.evaluate(() => {
    window.__played = [];
    window.Audio = function (url) {
      this.play = () => {
        window.__played.push({ url, volume: this.volume });
        return Promise.resolve();
      };
    };
  });
  const played = () => page.evaluate(() => window.__played);
  const card = (i) => page.locator('.gp-card').nth(i);

  await card(0).click(); // to the back: its cry, at a gentle volume
  expect(await played()).toEqual([{ url: fakeCry(1), volume: 0.4 }]);
  await card(0).click(); // back to the front: silent
  await card(6).click(); // #7 has no cry: flips, silently
  await expect(card(6)).toHaveAttribute('aria-pressed', 'true');
  await card(2).focus(); // the keyboard flip plays it too
  await page.keyboard.press('Enter');
  expect((await played()).map((p) => p.url)).toEqual([fakeCry(1), fakeCry(3)]);

  // A remembered card coming back already flipped doesn't replay its cry
  await goToPage(page, 2);
  await goToPage(page, 1);
  await expect(card(2)).toHaveAttribute('aria-pressed', 'true');
  expect(await played()).toHaveLength(2);
});

test('[Extra] A blocked or missing cry is harmless: the card still flips, with no error', async ({ page, gain }) => {
  // The real Audio, with the cry's URL unreachable (the recording aborts it): play() rejects
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const errors = [];
  // A rejected play() would surface as an uncaught NotSupportedError (no playable source)
  // or NotAllowedError (autoplay blocked). The type is in the error's name, not its message.
  page.on('pageerror', (e) => /NotSupported|NotAllowed/.test(e.name) && errors.push(e.name + ': ' + e.message));
  const cryFailed = page.waitForEvent('requestfailed', (r) => r.url() === fakeCry(1));
  await page.locator('.gp-card').first().click();
  await expect(page.locator('.gp-card').first()).toHaveAttribute('aria-pressed', 'true');
  await cryFailed; // the cry really was tried and failed, so play() rejected...
  await page.waitForTimeout(500); // ...and that rejection has had time to surface
  expect(errors, 'no "Uncaught (in promise)"').toEqual([]);
});

/* ---------------------------------------------------------------- persistence, re-runs */

test('[README] All changes persist through the type filter and paging', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const check = async (n, type) => {
    const shown = await cards(page);
    expect(
      shown.map((c) => c.id),
      `page ${n}`
    ).toEqual(idsOnPage(n));
    expect(shown.every((c) => c.name === 'Testmon-' + c.id)).toBe(true);
    await expect(page.locator('select[name="post_tag"]')).toBeHidden();
    await expect(page.locator('select[name="capability"]')).toBeHidden();
    await expect(typeFilter(page)).toHaveCount(1);
    await expect(typeFilter(page)).toHaveValue(type);
    expect(await page.locator('.gp-empty').count()).toBeLessThanOrEqual(1);
    expect(await page.locator('.gp-card').count()).toBe(PER_PAGE); // one card each, no duplicates
  };
  await pickType(page, 'water');
  for (const n of [2, 3, 2, 1]) {
    await goToPage(page, n);
    await check(n, 'water');
  }
  await pickType(page, '');
  await goToPage(page, 3);
  await check(3, '');
  await page.goBack();
  await pageReady(page, 1);
  await check(1, '');
});

test('[README] Safe to run more than once on the same page (no duplicate cards or dropdowns)', async ({
  page,
  gain
}) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await pickType(page, 'water');
  await gain.inject('pokemon');
  await gain.inject('pokemon');
  await pageReady(page, 1);
  expect(
    await page.evaluate(() => ({
      cards: document.querySelectorAll('.gp-card').length,
      filters: document.querySelectorAll('.gp-type-filter').length,
      messages: document.querySelectorAll('.gp-empty').length
    }))
  ).toEqual({ cards: PER_PAGE, filters: 1, messages: 1 });
  // The chosen type survives a re-run, and nothing is wired up twice: one click, one flip
  await expect(typeFilter(page)).toHaveValue('water');
  expect(await visibleIds(page)).toEqual(idsOnPage(1).filter((id) => fakeTypes(id).includes('water')));
  const first = page.locator('.gp-card').nth((await cards(page)).findIndex((c) => c.visible));
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  // ...and the new dropdown works (the old one's listener is gone with it)
  await pickType(page, '');
  expect(await visibleIds(page)).toEqual(idsOnPage(1));
});

/* ---------------------------------------------------------------- fetching */

test('[PDF] Task 3 only fetches from PokeAPI, once per Pokémon', async ({ page, gain, pokeapi }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await goToPage(page, 2);
  await goToPage(page, 1); // back to page 1: cached, not asked again
  await gain.inject('pokemon'); // a re-run reuses the cache too
  await pageReady(page, 1);
  const requests = await gain.network(['pokemon']);
  expect(requests.length).toBeGreaterThan(0);
  for (const r of requests) expect(r).toMatch(/^fetch https:\/\/pokeapi\.co\/api\/v2\/pokemon\/\d+$/);
  expect([...pokeapi.requests].sort((a, b) => a - b)).toEqual([...idsOnPage(1), ...idsOnPage(2)]);
});

test('[Extra] If PokeAPI fails, the card shows an error instead of staying hidden, and is retried later', async ({
  page,
  gain,
  pokeapi
}) => {
  pokeapi.failing.add(5);
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const fifth = (await cards(page))[4];
  expect(fifth).toMatchObject({ id: 5, visible: true, error: true });
  await expect(page.locator('.gp-card--error')).toHaveText("Couldn't load Pokémon #5");
  // The others are unaffected, and the error card doesn't flip
  expect((await cards(page)).filter((c) => c.error).length).toBe(1);
  await page.locator('.gp-card--error').click();
  await expect(page.locator('.gp-card--flipped')).toHaveCount(0);
  // The failure is logged (expected here), not thrown
  expect(gain.errors.splice(0)).toEqual([expect.stringMatching(/^\[gp\] #5/)]);

  pokeapi.failing.clear(); // PokeAPI is back: paging away and back tries again
  await goToPage(page, 2);
  await goToPage(page, 1);
  expect((await cards(page))[4]).toMatchObject({ id: 5, error: false, name: 'Testmon-5' });
});

test('[Extra] The site still sees card clicks (no stopPropagation), for its analytics', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  await page.evaluate(() => {
    window.__siteClicks = 0;
    document.addEventListener('click', () => window.__siteClicks++);
  });
  await page.locator('.gp-card').nth(1).click();
  expect(await page.evaluate(() => window.__siteClicks)).toBe(1);
});

/* ---------------------------------------------------------------- the brief's instructions, bonus */

test('[PDF] The CSS is a separate file, injected into <head>; the JS adds no styles or libraries', async ({
  page,
  gain
}) => {
  await gain.open([]);
  const count = () =>
    page.evaluate(() => ({
      styles: document.querySelectorAll('style, link[rel="stylesheet"]').length,
      scripts: document.querySelectorAll('script[src]').length
    }));
  const { js, css } = source('pokemon');
  const before = await count();
  await page.addScriptTag({ content: js }); // JS alone
  await page.waitForSelector('.gp-card');
  expect(await count()).toEqual(before);
  await page.addStyleTag({ content: css });
  expect(
    await page.evaluate((c) => [...document.head.querySelectorAll('style')].some((s) => s.textContent === c), css)
  ).toBe(true);
});

test('[Bonus] Task 3 works when it runs before the page has finished loading (document-start)', async ({
  page,
  gain
}) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => (window.__earlyStart = !!window.__gainPokemon));
  });
  await gain.open(['pokemon'], { timing: 'start' });
  expect(await page.evaluate(() => window.__earlyStart)).toBe(true);
  await pageReady(page, 1);
  await expect(typeFilter(page)).toHaveCount(1);
  await pickType(page, 'fire');
  await goToPage(page, 2);
  expect(await visibleIds(page)).toEqual(idsOnPage(2).filter((id) => fakeTypes(id).includes('fire')));
  await page.locator('.gp-card').nth(3).click();
  expect(await isTurned(page, 3)).toBe(true);
});

test.describe('[Bonus] Animations where they improve the experience', () => {
  const timings = (page) =>
    page.evaluate(() => {
      const longest = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) || 0));
      const card = getComputedStyle(document.querySelector('.gp-card'));
      const inner = getComputedStyle(document.querySelector('.gp-card__inner'));
      return {
        'cards fade in': card.animationName !== 'none' ? longest(card.animationDuration) : 0,
        'card lifts on hover': longest(card.transitionDuration),
        'card flips': longest(inner.transitionDuration)
      };
    });

  test('the cards fade in, lift on hover and flip with a 3D turn', async ({ page, gain }) => {
    await gain.open(['pokemon']);
    for (const [what, s] of Object.entries(await timings(page))) expect(s, what).toBeGreaterThan(0);
  });

  test.describe('[Extra] reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('with "reduce motion" switched on, they are all off', async ({ page, gain }) => {
      await gain.open(['pokemon']);
      for (const [what, s] of Object.entries(await timings(page))) expect(s, what).toBeLessThan(0.001);
    });
  });
});

/* ---------------------------------------------------------------- layout */

for (const [name, size] of Object.entries(VIEWPORTS)) {
  test.describe(`[README] Works on desktop, tablet and mobile: ${name} (${size.width}px)`, () => {
    test.use({ viewport: size });

    test('cards fit the screen, in 1 column on mobile and 2+ on wider screens; both sides of a card match', async ({
      page,
      gain
    }) => {
      await gain.open(['pokemon']);
      await pageReady(page, 1);
      await page.locator('.gp-card').first().click(); // check a flipped card too
      const layout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.gp-card')];
        // The <li>s, not the cards: the card under the mouse is lifted a few px by its hover style
        const rects = cards.map((c) => c.parentElement.getBoundingClientRect());
        const firstRowTop = rects[0].top;
        const faces = [...document.querySelectorAll('.gp-card__face')];
        return {
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          outside: rects.filter((r) => r.left < 0 || r.right > innerWidth + 0.5).length,
          columns: rects.filter((r) => Math.abs(r.top - firstRowTop) < 2).length,
          // nothing inside a face is cut off sideways or downward
          clipped: faces.filter((f) => f.scrollWidth > f.clientWidth + 1 || f.scrollHeight > f.clientHeight + 1).length,
          sidesDiffer: cards.filter((c) => {
            const [front, back] = c.querySelectorAll('.gp-card__face');
            return Math.abs(front.offsetHeight - back.offsetHeight) > 1;
          }).length
        };
      });
      expect(layout.pageOverflow, 'no sideways scrolling').toBeLessThanOrEqual(0);
      expect(layout.outside, 'cards inside the screen').toBe(0);
      expect(layout.clipped, 'no content cut off').toBe(0);
      expect(layout.sidesDiffer, 'front and back the same height').toBe(0);
      if (name === 'mobile') expect(layout.columns).toBe(1);
      else expect(layout.columns).toBeGreaterThanOrEqual(2);
      // The type filter fits too
      const filter = await typeFilter(page).evaluate((s) => s.getBoundingClientRect().toJSON());
      expect(filter.right).toBeLessThanOrEqual(size.width + 0.5);
    });
  });
}

test('[README] Uses Flex or Grid CSS', async ({ page, gain }) => {
  await gain.open(['pokemon']);
  await pageReady(page, 1);
  const display = await page.evaluate(() => {
    const d = (sel) => getComputedStyle(document.querySelector(sel)).display;
    return {
      card: d('[data-behaviour="listing"] .listing-box'),
      inner: d('.gp-card__inner'),
      face: d('.gp-card__face'),
      types: d('.gp-card__types'),
      stats: d('.gp-stats'),
      stat: d('.gp-stat')
    };
  });
  for (const [part, value] of Object.entries(display)) expect(['flex', 'grid'], part).toContain(value);
});
