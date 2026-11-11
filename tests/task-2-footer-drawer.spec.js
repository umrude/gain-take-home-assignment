/**
 * Task 2: Footer Drawer.
 * Test titles quote the requirement they check:
 *   [README] = an item from the take-home checklist, [PDF] = a requirement from the brief
 *   that the checklist doesn't list, [Extra] = our own addition beyond the brief.
 * Expected content comes from the homepage itself (readHomepage), not from drawer.js.
 */
const { test, expect } = require('./fixtures');
const { VIEWPORTS } = require('./paths');

const PER_PAGE = { mobile: 1, tablet: 2, desktop: 4 }; // the brief: 1 / at least 2 / at least 4

/* ---------------------------------------------------------------- helpers */

const toggle = (page) => page.locator('.gd-tab__toggle');
const isOpen = (page) => page.evaluate(() => document.documentElement.classList.contains('gd-open'));
// Wait for the drawer's transitions to finish (slide, chevron, overlay)
const settle = (page) =>
  page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('[data-gain="gd"]')].flatMap((el) =>
        el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))
      )
    )
  );
async function open(page) {
  await toggle(page).click();
  await settle(page);
  expect(await isOpen(page)).toBe(true);
}
/**
 * A finger drag from `from` to `to`, as raw touch events through Chrome's input pipeline
 * (so the browser does its own native touch scrolling, snapping included).
 */
async function touchDrag(page, from, to, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const point = (i) => [
    { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id: 1 }
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(i) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800); // snap + counter
}
const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));

const rect = (page, selector) =>
  page
    .locator(selector)
    .first()
    .evaluate((e) => e.getBoundingClientRect().toJSON());
const viewport = (page) => page.viewportSize();

// Slides fully / partly inside the visible part of the track
const visibleSlides = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('.gd-track').getBoundingClientRect();
    const slides = [...document.querySelectorAll('.gd-slide')].map((s) => s.getBoundingClientRect());
    const full = slides.filter((b) => b.left >= t.left - 0.5 && b.right <= t.right + 0.5).length;
    const partial = slides.filter((b) => b.right > t.left + 0.5 && b.left < t.right - 0.5).length - full;
    return { full, partial };
  });

// The tooltip bubble (::after) and arrow (::before) of a tag, from computed styles
// (pseudo-elements can't be measured with getBoundingClientRect)
const tooltip = (page, index = 0) =>
  page
    .locator('.gd-tag')
    .nth(index)
    .evaluate((tag) => {
      const a = getComputedStyle(tag, '::after');
      const b = getComputedStyle(tag, '::before');
      const t = tag.getBoundingClientRect();
      const box = { left: t.left + tag.clientLeft, top: t.top + tag.clientTop }; // padding box
      box.bottom = box.top + tag.clientHeight;
      const slide = tag.closest('.gd-slide').getBoundingClientRect();
      const track = tag.closest('.gd-track').getBoundingClientRect();
      const px = (v) => parseFloat(v) || 0;
      const width = px(a.width) + (a.boxSizing === 'border-box' ? 0 : px(a.paddingLeft) + px(a.paddingRight));
      const height = px(a.height) + (a.boxSizing === 'border-box' ? 0 : px(a.paddingTop) + px(a.paddingBottom));
      const above = a.top === 'auto' || a.bottom !== 'auto';
      const top = above ? box.bottom - px(a.bottom) - height : box.top + px(a.top);
      const left = box.left + px(a.left);
      const bubble = { left, top, width, height, right: left + width, bottom: top + height };
      return {
        text: a.content.replace(/^"|"$/g, ''),
        opacity: Number(a.opacity),
        background: a.backgroundColor,
        color: a.color,
        transform: a.transform,
        arrow: { opacity: Number(b.opacity), border: b.borderTopColor, centreX: box.left + px(b.left) },
        tag: t.toJSON(),
        bubble,
        inSlide: bubble.left >= slide.left - 0.5 && bubble.right <= slide.right + 0.5,
        inTrack: bubble.left >= track.left - 0.5 && bubble.right <= track.right + 0.5 && bubble.top >= track.top - 0.5
      };
    });

test.beforeEach(async ({ gain }) => {
  await gain.open(['drawer']);
});
test.afterEach(async ({ gain }) => {
  expect(gain.errors, 'errors from drawer.js').toEqual([]);
});

/* ---------------------------------------------------------------- drawer */

test('[README] Sticky drawer at the bottom of the page', async ({ page }) => {
  const vh = viewport(page).height;
  expect(await page.locator('.gd-drawer').evaluate((d) => getComputedStyle(d).position)).toBe('fixed');
  for (const y of [0, 2000, 5000]) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(200);
    const tab = await rect(page, '.gd-tab');
    expect(tab.bottom, `tab at scroll ${y}`).toBeCloseTo(vh, 0); // stuck to the bottom edge
    expect(tab.top).toBeLessThan(vh);
  }
});

test('[README] Tab toggles the drawer on/off', async ({ page }) => {
  const vh = viewport(page).height;
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  expect((await rect(page, '.gd-panel')).top).toBeGreaterThanOrEqual(vh - 1); // hidden below the screen
  await open(page);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  expect((await rect(page, '.gd-panel')).bottom).toBeCloseTo(vh, 0);
  await toggle(page).click();
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  expect((await rect(page, '.gd-panel')).top).toBeGreaterThanOrEqual(vh - 1);
});

test('[PDF] Figure 3: when hidden, only the tab shows, centred at the bottom', async ({ page }) => {
  const { width, height } = viewport(page);
  const tab = await rect(page, '.gd-tab');
  expect(tab.left + tab.width / 2).toBeCloseTo(width / 2, 0);
  expect(tab.bottom).toBeCloseTo(height, 0);
  await expect(page.locator('.gd-tab__nav')).toBeHidden(); // page count + arrows only when open
  await expect(page.locator('.gd-tab')).toHaveScreenshot('tab-closed.png');
});

test('[README] Chevron rotates 180 degrees on toggle (animated)', async ({ page }) => {
  // rotate(θ) → matrix(cos θ, sin θ, …): cos is 1 at 0°, -1 at 180°, in between mid-turn
  const cos = () =>
    page.locator('.gd-chevron').evaluate((c) => {
      const t = getComputedStyle(c).transform;
      return t === 'none' ? 1 : Number(t.match(/matrix\(([^,]+)/)[1]);
    });
  expect(await cos()).toBeCloseTo(1, 2);
  await toggle(page).click();
  await page.waitForTimeout(120);
  const mid = await cos();
  expect(mid, 'mid-way through the rotation').toBeGreaterThan(-0.999);
  expect(mid).toBeLessThan(0.999);
  await settle(page);
  expect(await cos()).toBeCloseTo(-1, 2);
  await toggle(page).click();
  await settle(page);
  expect(await cos()).toBeCloseTo(1, 2);
});

test('[README] Drawer slides in and out from the bottom (animated)', async ({ page }) => {
  const vh = viewport(page).height;
  await toggle(page).click();
  await page.waitForTimeout(120);
  const mid = await rect(page, '.gd-panel');
  expect(mid.top, 'part-way up while sliding in').toBeLessThan(vh - 1);
  expect(mid.bottom).toBeGreaterThan(vh + 1);
  await settle(page);
  expect((await rect(page, '.gd-panel')).bottom).toBeCloseTo(vh, 0);
  await toggle(page).click();
  await page.waitForTimeout(120);
  expect((await rect(page, '.gd-panel')).bottom, 'part-way down while sliding out').toBeGreaterThan(vh + 1);
  await settle(page);
  expect((await rect(page, '.gd-panel')).top).toBeGreaterThanOrEqual(vh - 1);
});

test('[README] Overlay on the page, and clicking it closes the drawer', async ({ page }) => {
  const { width, height } = viewport(page);
  const style = () =>
    page
      .locator('.gd-overlay')
      .evaluate((o) => [Number(getComputedStyle(o).opacity), getComputedStyle(o).pointerEvents]);
  expect(await style()).toEqual([0, 'none']); // closed: invisible, and clicks pass through to the page
  await open(page);
  const overlay = await rect(page, '.gd-overlay');
  expect([overlay.left, overlay.top, overlay.width, overlay.height]).toEqual([0, 0, width, height]);
  expect(await page.locator('.gd-overlay').evaluate((o) => Number(getComputedStyle(o).opacity))).toBeGreaterThan(0.9);
  await page.mouse.click(width / 2, 40); // above the drawer: the overlay
  await settle(page);
  expect(await isOpen(page)).toBe(false);
});

test('[Extra] Esc closes the drawer, and focus never lands inside the closed panel', async ({ page }) => {
  await open(page);
  await page.locator('.gd-slide__link').first().focus();
  await page.keyboard.press('Escape');
  expect(await isOpen(page)).toBe(false);
  await expect(toggle(page)).toBeFocused();
  expect(await page.locator('.gd-panel').evaluate((p) => p.inert)).toBe(true);
});

/* ---------------------------------------------------------------- closing at the bottom */

test.describe('[README] Drawer closes automatically at the bottom of the page', () => {
  test('scrolling down to the bottom closes it', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 120 && (await isOpen(page)); i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800); // confirm delay
    expect(await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2)).toBe(true);
    expect(await isOpen(page)).toBe(false);
  });

  test('[Extra] opening it while already at the bottom keeps it open; leaving and coming back closes it', async ({
    page
  }) => {
    for (let i = 0; i < 120; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(40);
      if (await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2)) break;
    }
    await page.waitForTimeout(800);
    await open(page);
    await page.waitForTimeout(800);
    expect(await isOpen(page)).toBe(true);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(600);
    for (let i = 0; i < 10 && (await isOpen(page)); i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(800);
    expect(await isOpen(page)).toBe(false);
  });
});

test.describe('[Extra] Scrolling with the pointer over the open drawer', () => {
  // Found by this suite: the site's Lenis CSS gives opted-out elements
  // `overscroll-behavior: contain`, which swallowed vertical scrolling over the drawer, so
  // the page could never reach the bottom (and the drawer never auto-closed).
  test('desktop: the mouse wheel over the cards scrolls the page', async ({ page }) => {
    await open(page);
    const card = await page.locator('.gd-slide').first().boundingBox();
    await page.mouse.move(card.x + 100, card.y + 100);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);
    expect(await scrollY(page)).toBeGreaterThan(500);
  });

  test.describe('short screen', () => {
    test.use({ viewport: { width: 667, height: 375 } }); // a landscape phone
    test('the panel is capped to the screen and the wheel scrolls it', async ({ page }) => {
      await open(page);
      const panel = page.locator('.gd-panel');
      const b = await panel.boundingBox();
      expect((await rect(page, '.gd-tab')).top).toBeGreaterThanOrEqual(0);
      await page.mouse.move(b.x + 50, b.y + 50);
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(600);
      expect(await panel.evaluate((p) => p.scrollTop)).toBeGreaterThan(0);
      expect(await scrollY(page)).toBe(0);
    });
  });

  test.describe('touch', () => {
    test.use({ viewport: VIEWPORTS.mobile, hasTouch: true, isMobile: true });
    test('a vertical swipe over the cards scrolls the page', async ({ page }) => {
      await page.locator('.gd-tab__toggle').tap();
      await settle(page);
      const card = await page.locator('.gd-slide').first().boundingBox();
      await touchDrag(page, { x: card.x + 150, y: card.y + 300 }, { x: card.x + 150, y: card.y + 50 });
      expect(await scrollY(page)).toBeGreaterThan(100);
      await expect(page.locator('.gd-tab__counter')).toHaveText(/^1\//); // and didn't move the slider
    });
  });
});

/* ---------------------------------------------------------------- slides */

test('[README] One slide per case study, read from the "Work" slider (nothing hardcoded or fetched)', async ({
  page,
  gain
}) => {
  const home = await gain.readHomepage();
  const slides = await page.locator('.gd-slide').evaluateAll((els) =>
    els.map((s) => ({
      title: s.querySelector('h3').textContent.trim(),
      url: s.querySelector('.gd-slide__link').href
    }))
  );
  expect(slides).toEqual(home.work.map((w) => ({ title: w.title, url: w.url })));
  // nothing fetched: see all-tasks.spec.js
});

test('[README] Each slide has an image, header, industry tag with tooltip, service description and link', async ({
  page,
  gain
}) => {
  const home = await gain.readHomepage();
  const description = Object.fromEntries(home.services.map((s) => [s.name.toLowerCase(), s.description]));
  // Same image even if the card shows a different size (srcset): compare the file, minus "-WxH"
  const file = (url) =>
    url
      .split('/')
      .pop()
      .replace(/-\d+x\d+(?=\.\w+$)/, '');
  const slides = await page.locator('.gd-slide').evaluateAll((els) =>
    els.map((s) => ({
      image: (s.querySelector('img') || {}).src || '',
      header: s.querySelector('h3').textContent.trim(),
      tag: s.querySelector('.gd-tag').textContent.replace('ⓘ', '').trim(),
      tooltip: s.querySelector('.gd-tag').dataset.tooltip,
      description: (s.querySelector('.gd-slide__description') || {}).textContent || '',
      link: s.querySelector('a').href
    }))
  );
  expect(slides).toHaveLength(home.work.length);
  slides.forEach((s, i) => {
    const w = home.work[i];
    expect(file(s.image), `image ${i + 1}`).toBe(file(w.image));
    expect(s.header).toBe(w.title);
    expect(s.tag).toBe(w.industry); // "Tag: its industry"
    expect(s.tooltip).toContain(w.service); // "with a tooltip showing its service and industry"
    expect(s.tooltip).toContain(w.industry);
    expect(s.description).toBe(description[w.service.toLowerCase()]); // from the "Solutions" menu
    expect(s.link).toBe(w.url);
  });
});

/* ---------------------------------------------------------------- slider */

test('[README] Page count and arrow buttons when the drawer is open', async ({ page }) => {
  const nav = page.locator('.gd-tab__nav');
  const counter = page.locator('.gd-tab__counter');
  const [prev, next] = [
    page.getByRole('button', { name: 'Previous page' }),
    page.getByRole('button', { name: 'Next page' })
  ];
  await expect(nav).toBeHidden();
  await open(page);
  await expect(nav).toBeVisible();
  const pages = Math.ceil((await page.locator('.gd-slide').count()) / PER_PAGE.desktop);
  await expect(counter).toHaveText(`1/${pages}`);
  await expect(prev).toHaveAttribute('aria-disabled', 'true');

  const firstVisible = () =>
    page.evaluate(() => {
      const t = document.querySelector('.gd-track');
      return [...t.children].findIndex((s) => s.getBoundingClientRect().left >= t.getBoundingClientRect().left - 1);
    });
  for (let p = 2; p <= pages; p++) {
    await next.click();
    await expect(counter).toHaveText(`${p}/${pages}`);
  }
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await page.waitForTimeout(500);
  expect(await firstVisible()).toBeGreaterThan(0); // the content actually moved
  await prev.click();
  await expect(counter).toHaveText(`${pages - 1}/${pages}`);
});

for (const [name, size] of Object.entries(VIEWPORTS)) {
  test(`[README] 4+ slides on desktop, 2+ on tablet, 1 on mobile: ${name} ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    expect(await visibleSlides(page)).toEqual({ full: PER_PAGE[name], partial: 0 });
    // and at the end of the track
    await page.locator('.gd-track').evaluate((t) => (t.scrollLeft = t.scrollWidth));
    await page.waitForTimeout(300);
    expect(await visibleSlides(page)).toEqual({ full: PER_PAGE[name], partial: 0 });
  });
}

test.describe('[README] Slider is draggable and swipeable on smaller viewports', () => {
  const firstVisible = (page) =>
    page.locator('.gd-track').evaluate((t) => {
      const left = t.getBoundingClientRect().left;
      return [...t.children].findIndex((s) => s.getBoundingClientRect().left >= left - 1);
    });

  test('mouse drag moves to the next slide and snaps', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await open(page);
    const box = await page.locator('.gd-slide').first().boundingBox();
    const y = box.y + box.height / 3;
    await page.mouse.move(box.x + box.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8 - box.width * 0.7, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    expect(await firstVisible(page)).toBe(1);
    expect(await visibleSlides(page)).toEqual({ full: 2, partial: 0 }); // snapped, not half-way
  });

  test("a drag released over a link doesn't open it; a plain click does", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      window.__clicks = 0;
      document.querySelectorAll('.gd-slide__link').forEach((a) =>
        a.addEventListener('click', (e) => {
          window.__clicks++;
          e.preventDefault();
        })
      );
    });
    const link = page.locator('.gd-slide__link').nth(1);
    const b = await link.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__clicks)).toBe(0);
    await page.locator('.gd-slide__link').first().click();
    expect(await page.evaluate(() => window.__clicks)).toBe(1);
  });

  test.describe('touch', () => {
    test.use({ viewport: VIEWPORTS.mobile, hasTouch: true, isMobile: true });

    test('swiping moves one slide on mobile', async ({ page }) => {
      await page.locator('.gd-tab__toggle').tap();
      await settle(page);
      const box = await page.locator('.gd-track').boundingBox();
      const y = box.y + box.height / 3;
      await touchDrag(page, { x: box.x + box.width * 0.85, y }, { x: box.x + box.width * 0.2, y });
      expect(await firstVisible(page)).toBe(1);
      await expect(page.locator('.gd-tab__counter')).toHaveText(/^2\//);
    });
  });
});

/* ---------------------------------------------------------------- tooltip */

test.describe('[README] Tooltip matches Figure 5 and handles small screens or tight space', () => {
  test('hover: a dark bubble above the tag with a downward arrow centred on it (Figure 5)', async ({ page }) => {
    await open(page);
    expect((await tooltip(page)).opacity).toBe(0);
    await page.locator('.gd-tag').first().hover();
    await page.waitForTimeout(300);
    const t = await tooltip(page);
    expect(t.opacity).toBe(1);
    expect(t.arrow.opacity).toBe(1);
    expect(t.bubble.bottom).toBeLessThan(t.tag.top); // above the tag
    expect(t.arrow.border).toBe(t.background); // arrow in the bubble's colour
    expect(Math.abs(t.arrow.centreX - (t.tag.left + t.tag.width / 2))).toBeLessThan(1); // pointing at the tag
    expect(t.background).not.toBe(t.color); // readable text
    expect(t.transform).toBe('none'); // upright (a site rule once rotated it on tap)
    await expect(page.locator('.gd-slide').first()).toHaveScreenshot('tooltip-hover.png', {
      mask: [page.locator('.gd-slide__image')] // the photo comes from the recording
    });
  });

  for (const [name, size] of Object.entries(VIEWPORTS)) {
    test(`every tooltip fits inside its slide and the visible slider: ${name} ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      const count = await page.locator('.gd-tag').count();
      for (let i = 0; i < count; i++) {
        // bring the slide to the first position (or as far as the track scrolls)
        await page
          .locator('.gd-slide')
          .nth(i)
          .evaluate((s) => {
            const t = s.parentElement;
            t.scrollLeft = s.offsetLeft - parseFloat(getComputedStyle(t).paddingLeft);
          });
        await page.waitForTimeout(80);
        const t = await tooltip(page, i);
        expect(t.inSlide, `tooltip ${i + 1} inside its slide`).toBe(true);
        expect(t.inTrack, `tooltip ${i + 1} inside the visible slider`).toBe(true);
      }
    });
  }

  test('long text wraps inside the slide instead of overflowing (375px, last slide)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await open(page);
    const last = (await page.locator('.gd-tag').count()) - 1;
    await page
      .locator('.gd-tag')
      .nth(last)
      .evaluate((tag) => {
        tag.dataset.tooltip = 'Customer Science, Conversion and Performance · Food & Drink, Consumer Goods and Tech';
        tag.closest('.gd-track').scrollLeft = 1e6;
      });
    await page.waitForTimeout(200);
    const t = await tooltip(page, last);
    expect(t.inSlide).toBe(true);
    expect(t.bubble.height).toBeGreaterThan(40); // wrapped onto more lines
  });

  test.describe('touch', () => {
    test.use({ viewport: VIEWPORTS.mobile, hasTouch: true, isMobile: true });

    test('tap shows it (upright), tap again or tap elsewhere hides it', async ({ page }) => {
      await open(page);
      const tag = page.locator('.gd-tag').first();
      await tag.tap();
      await page.waitForTimeout(300);
      let t = await tooltip(page);
      expect(t.opacity).toBe(1);
      expect(t.transform).toBe('none');
      await tag.tap();
      await page.waitForTimeout(300);
      expect((await tooltip(page)).opacity).toBe(0);
      await tag.tap();
      await page.locator('.gd-slide__title').first().tap();
      await page.waitForTimeout(300);
      expect((await tooltip(page)).opacity).toBe(0);
    });
  });

  test('keyboard focus shows it too', async ({ page }) => {
    await open(page);
    await toggle(page).focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement.classList.contains('gd-tag'))) break;
    }
    await page.waitForTimeout(300);
    expect((await tooltip(page)).opacity).toBe(1);
  });
});

/* ---------------------------------------------------------------- layout */

test('[README] Uses Flex or Grid CSS', async ({ page }) => {
  await open(page);
  const layout = await page.evaluate(() => {
    const containers = ['.gd-tab', '.gd-tab__toggle', '.gd-tab__nav', '.gd-track', '.gd-slide', '.gd-slide__body'].map(
      (s) => [s, getComputedStyle(document.querySelector(s)).display]
    );
    const ours = [...document.querySelectorAll('[data-gain="gd"], [data-gain="gd"] *')];
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

for (const [name, size] of Object.entries(VIEWPORTS)) {
  test(`[README] Works on desktop, tablet and mobile (down to 375px): ${name} ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
    const before = await pageWidth();
    const tab = await rect(page, '.gd-tab');
    expect(tab.left).toBeGreaterThanOrEqual(0);
    expect(tab.right).toBeLessThanOrEqual(size.width);
    await open(page);
    expect(await pageWidth()).toBeLessThanOrEqual(Math.max(before, size.width)); // no sideways scroll from us
    const panel = await rect(page, '.gd-panel');
    const openTab = await rect(page, '.gd-tab');
    expect(openTab.top).toBeGreaterThanOrEqual(0); // the whole drawer fits on screen
    expect(panel.bottom).toBeCloseTo(size.height, 0);
    // Every card's button is inside the panel (pinned to the card bottom, not cut off)
    const links = await page
      .locator('.gd-slide__link')
      .evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().bottom));
    for (const b of links) expect(b).toBeLessThanOrEqual(panel.bottom);
  });
}

test("[Extra] Cookiebot's button stays clickable above the open drawer", async ({ page }) => {
  await open(page);
  const widget = page.locator('#CookiebotWidget');
  test.skip(!(await widget.isVisible().catch(() => false)), 'Cookiebot widget not in this recording');
  const b = await widget.boundingBox();
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).closest('#CookiebotWidget') !== null, {
    x: b.x + b.width / 2,
    y: b.y + b.height / 2
  });
  expect(top).toBe(true);
});
