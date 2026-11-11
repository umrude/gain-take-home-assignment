/**
 * Shared test setup. Every test gets:
 *  - the homepage (or, with test.use({ site: 'blog' }), the blog) replayed offline from the
 *    recording (tests/record.js), so no request reaches GAIN; anything not in the
 *    recording is aborted;
 *  - a fake PokeAPI (`pokeapi`, below), so Task 3 runs offline on data the tests know;
 *  - `gain`, a helper for injecting the tasks and reading the page.
 *
 * Injection follows the brief:
 *  - CSS goes into <head> as a <style> ("injectable into the <head>");
 *  - JS is added as a plain classic <script>, which runs in the global scope the same way
 *    pasting into the console does. Each gets a //# sourceURL so errors and network calls
 *    can be traced back to OUR scripts rather than the site's.
 *  - timing 'start' instead registers both before the page's HTML exists, like
 *    Tampermonkey's @run-at document-start (the bonus).
 */
const fs = require('fs');
const path = require('path');
const base = require('@playwright/test');
const { HAR, HAR_BLOG, HOME, BLOG, ROOT } = require('./paths');

const TASKS = {
  questionnaire: { dir: 'task-1-questionnaire', js: 'questionnaire.js', css: 'questionnaire.css', root: '.gq-section' },
  drawer: { dir: 'task-2-footer-drawer', js: 'drawer.js', css: 'drawer.css', root: '.gd-slide' },
  pokemon: { dir: 'task-3-spa-pokemon', js: 'pokemon.js', css: 'pokemon.css', root: '.gp-card' }
};
const SITES = { home: { url: HOME, har: HAR }, blog: { url: BLOG, har: HAR_BLOG } };

/*
 * The fake PokeAPI. Made-up but predictable, so a test can work out what each card should
 * show: every 4th Pokémon is Fire, other odd ones Grass/Poison, other even ones Water,
 * and nothing is Dragon (for the "none of this type" message). The artwork is a data: URL,
 * so images "load" without any network.
 */
function fakeTypes(id) {
  if (id % 4 === 0) return ['fire'];
  return id % 2 ? ['grass', 'poison'] : ['water'];
}
function fakePokemon(id) {
  const art = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" id="art-${id}"/>`);
  return {
    id,
    name: 'testmon-' + id,
    height: 7,
    weight: 69,
    abilities: [{ ability: { name: 'swift-swim' } }],
    cries: {},
    sprites: { front_default: '', other: { 'official-artwork': { front_default: art } } },
    stats: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((name, i) => ({
      base_stat: 40 + i * 10,
      stat: { name }
    })),
    types: fakeTypes(id).map((name, i) => ({ slot: i + 1, type: { name } }))
  };
}

function source(task) {
  const t = TASKS[task];
  return {
    js: fs.readFileSync(path.join(ROOT, t.dir, t.js), 'utf8') + '\n//# sourceURL=gain-' + task + '.js',
    css: fs.readFileSync(path.join(ROOT, t.dir, t.css), 'utf8')
  };
}

// Runs in the page before anything else: records fetch/XHR calls whose stack includes one
// of our scripts, as "task: kind url". Tasks 1 and 2 must fetch nothing; Task 3 only PokeAPI.
function networkSpy() {
  window.__gainNetwork = [];
  const ours = (kind, url) => {
    const m = (new Error().stack || '').match(/gain-(questionnaire|drawer|pokemon)\.js/);
    if (m) window.__gainNetwork.push(m[1] + ': ' + kind + ' ' + url);
  };
  const fetch = window.fetch;
  window.fetch = function (input) {
    ours('fetch', String((input && input.url) || input));
    return fetch.apply(this, arguments);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    ours('xhr', url);
    return open.apply(this, arguments);
  };
}

/**
 * Reads what the brief says the tasks must use, straight from the homepage, written
 * independently of the task scripts (if a script scraped the wrong thing, a test that
 * reused its scraping would be wrong in the same way and still pass).
 */
function readHomepage() {
  const text = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  const realSrc = (img) => {
    if (!img) return '';
    const src = img.getAttribute('src') || '';
    const m = src.startsWith('data:image/svg+xml;base64,') && atob(src.split(',')[1]).match(/data-u="([^"]+)"/);
    return m ? decodeURIComponent(m[1]) : img.currentSrc || img.src;
  };
  const sliderAfter = (heading) => {
    const h2 = [...document.querySelectorAll('main h2')].find((h) => text(h) === heading);
    return [...document.querySelectorAll('.content-slider')].find(
      (s) => h2.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  };
  // One entry per URL: the slider clones cards to loop
  const cards = (heading) => {
    const seen = new Set();
    return [...sliderAfter(heading).querySelectorAll('.content-card')]
      .map((c) => ({
        title: text(c.querySelector('.content-card__link')),
        url: c.querySelector('.content-card__link').href,
        image: realSrc(c.querySelector('img')),
        tags: [...c.querySelectorAll('.content-tags li')].map(text)
      }))
      .filter((c) => !seen.has(c.url) && seen.add(c.url));
  };

  const solutions = [...document.querySelectorAll('.site-navigation__item')].find(
    (li) => text(li.querySelector('.site-navigation__link')) === 'Solutions'
  );
  const sectorsLabel = [...document.querySelectorAll('main p')].find((p) => text(p) === 'Our Sectors');
  const mailto = document.querySelector('footer a[href^="mailto:"]');

  return {
    services: [...solutions.querySelectorAll('.site-navigation__submenu-link')].map((a) => ({
      name: text(a.querySelector('.site-navigation__submenu-link-title')),
      description: text(a.querySelector('.site-navigation__submenu-link-description'))
    })),
    sectors: [...sectorsLabel.closest('.wp-block-columns').querySelectorAll('a')].map(text),
    work: cards('Work').map((c) => ({ ...c, service: c.tags[0], industry: c.tags[1] })),
    insights: cards('Insights'),
    // Cloudflare's own script decodes the protected email on the page
    email: mailto ? mailto.getAttribute('href').replace('mailto:', '') : ''
  };
}

const test = base.test.extend({
  // Which recorded page this test runs on: test.use({ site: 'blog' }) for Task 3
  site: ['home', { option: true }],

  /*
   * Controls for the fake PokeAPI, per test: `requests` lists every id asked for,
   * add an id to `failing` to make it answer 500, set `delay` (ms) to slow every answer.
   */
  pokeapi: async ({}, use) => {
    await use({ requests: [], failing: new Set(), delay: 0 });
  },

  // Replay the recorded site for every page in the test; PokeAPI is answered by the fake
  context: async ({ context, site, pokeapi }, use) => {
    await context.routeFromHAR(SITES[site].har, { notFound: 'abort' });
    await context.route('https://pokeapi.co/**', async (route) => {
      const id = Number(
        route
          .request()
          .url()
          .match(/\/pokemon\/(\d+)\/?$/)[1]
      );
      pokeapi.requests.push(id);
      if (pokeapi.delay) await new Promise((r) => setTimeout(r, pokeapi.delay));
      const headers = { 'access-control-allow-origin': '*' };
      if (pokeapi.failing.has(id)) return route.fulfill({ status: 500, headers, body: 'error' });
      return route.fulfill({ json: fakePokemon(id), headers }).catch(() => {}); // page may have closed meanwhile
    });
    await use(context);
  },

  gain: async ({ page, site }, use) => {
    const errors = [];
    // Our scripts' uncaught errors (traced by sourceURL), and their console warnings
    // ("[gq] waitFor timeout"); the site's own errors are not ours to fail on.
    page.on(
      'pageerror',
      (e) => /gain-(questionnaire|drawer|pokemon)\.js/.test(e.stack || '') && errors.push(e.message)
    );
    page.on('console', (m) => /^\[(gq|gd|gp)\]/.test(m.text()) && errors.push(m.text()));
    await page.addInitScript(networkSpy);

    const gain = {
      errors,

      /**
       * Load the page (the homepage, or the blog with site: 'blog'; `url` for another one)
       * with the given tasks injected after load (default) or at document-start.
       */
      async open(tasks, { timing = 'ready', url = SITES[site].url } = {}) {
        if (timing === 'start') {
          for (const task of tasks) {
            const { js, css } = source(task);
            // This runs even earlier than Tampermonkey's document-start: before <html> exists.
            // So the <style> is added as soon as <html> appears (no <head> yet either), and
            // the task script itself runs straight away: the harshest version of the bonus.
            // Top frame only (addInitScript also runs in iframes, e.g. Cookiebot's).
            await page.addInitScript(
              'if (window.top === window) {' +
                'var s = document.createElement("style"); s.textContent = ' +
                JSON.stringify(css) +
                ';\nvar addStyle = function () { (document.head || document.documentElement).appendChild(s); };\n' +
                'if (document.documentElement) addStyle(); else new MutationObserver(function (m, o) {' +
                ' if (document.documentElement) { o.disconnect(); addStyle(); } }).observe(document, { childList: true });\n' +
                js +
                '\n}'
            );
          }
        }
        await page.goto(url, { waitUntil: 'load' });
        await gain.dismissCookieBanner();
        if (timing === 'ready') for (const task of tasks) await gain.inject(task);
        for (const task of tasks) await gain.settled(TASKS[task].root);
      },

      /**
       * A first visit shows Cookiebot's consent banner, which covers the bottom of the
       * screen (on mobile, over our section's Start button). Answer it like a user would.
       */
      async dismissCookieBanner() {
        const deny = page.locator('#CybotCookiebotDialog').getByRole('button', { name: 'Deny', exact: true });
        if (await deny.isVisible({ timeout: 3000 }).catch(() => false)) await deny.click();
        else
          await deny.waitFor({ state: 'visible', timeout: 3000 }).then(
            () => deny.click(),
            () => {}
          );
        await page
          .locator('#CybotCookiebotDialog')
          .waitFor({ state: 'hidden', timeout: 3000 })
          .catch(() => {});
      },

      /** Wait until our element exists and its entrance animations have finished. */
      async settled(selector) {
        await page.waitForSelector(selector, { state: 'attached' });
        await page.evaluate((sel) => {
          const root = document.querySelector(sel).closest('[data-gain]') || document.querySelector(sel);
          return Promise.all(root.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
        }, selector);
      },

      /** Inject a task the way the brief describes (again = a re-run). */
      async inject(task) {
        const { js, css } = source(task);
        await page.addStyleTag({ content: css }); // goes into <head>
        await page.addScriptTag({ content: js });
        await gain.settled(TASKS[task].root);
      },

      readHomepage: () => page.evaluate(readHomepage),
      /** Requests made by our scripts, as "kind url"; only those of `tasks` (default: Tasks 1 and 2) */
      network: (tasks = ['questionnaire', 'drawer']) =>
        page.evaluate(
          (tasks) =>
            window.__gainNetwork
              .filter((entry) => tasks.includes(entry.split(':')[0]))
              .map((entry) => entry.slice(entry.indexOf(': ') + 2)),
          tasks
        ),
      source
    };
    await use(gain);
  }
});

module.exports = { test, expect: base.expect, TASKS, source, fakePokemon, fakeTypes };
