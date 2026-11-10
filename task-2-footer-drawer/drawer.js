/**
 * Task 2 — Footer Drawer
 * Page: https://www.thisisgain.com/
 * Paste this whole file into the DevTools console. CSS: drawer.css
 *
 * How it fits together (same shape as Task 1):
 *   1. waitFor() — wait until the Work slider and the Solutions menu exist
 *      (works at document-start).
 *   2. Scrape once — case studies from the "Work" slider, service descriptions from
 *      the "Solutions" menu. Nothing is hardcoded or fetched.
 *   3. build() — create the overlay + drawer (tab, counter, arrows, track of slides) once.
 *   4. Behaviour — setOpen() toggles one class on <html>; CSS does the slide/rotate
 *      animations. The track is a native scroll-snap scroller, so swipe works for free;
 *      arrows, the page counter and mouse-drag sit on top of it.
 *
 * Slider: native CSS scroll-snap + pointer-drag. No 3rd-party lib, so there is
 * nothing extra to load when pasting into the console.
 */
(function () {
  'use strict';

  const NS = 'gd';
  const INSTANCE_KEY = '__gainDrawer';

  // Re-run safety: tear down the previous instance (elements, listeners) first.
  if (window[INSTANCE_KEY] && typeof window[INSTANCE_KEY].destroy === 'function') {
    window[INSTANCE_KEY].destroy();
  }

  /*
   * Where things live on the page. Layout wrappers are generic (`wp-block-group`), so each
   * finder anchors on a visible label ("Work", "Solutions") or a component class
   * (`content-card`, `site-navigation__*`). Returns the element(s) or null.
   */
  const FIND = {
    // Cards in the first content slider after the "Work" heading.
    workCards: function () {
      const heading = findByText('main h2', 'Work');
      if (!heading) return null;
      const slider = Array.prototype.find.call(document.querySelectorAll('.content-slider'), function (s) {
        return heading.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING;
      });
      const cards = slider && slider.querySelectorAll('.content-card');
      return cards && cards.length ? cards : null;
    },
    // "Solutions" item in the top nav -> its submenu links (title + description).
    solutionsLinks: function () {
      const link = findByText('.site-navigation__link', 'Solutions');
      const item = link && link.closest('.site-navigation__item');
      const links = item && item.querySelectorAll('.site-navigation__submenu-link');
      return links && links.length ? links : null;
    }
  };

  /*
   * Every listener goes through on(), registered with one AbortController, so destroy()
   * removes them all with controller.abort() — including the window scroll/resize ones,
   * which would otherwise outlive our elements. `opts` allows e.g. { passive: true }.
   */
  const controller = new AbortController();
  const on = function (el, type, fn, opts) {
    el.addEventListener(type, fn, Object.assign({ signal: controller.signal }, opts));
  };

  /* ---------------------------------------------------------------- helpers */

  /**
   * Resolves with the first truthy result of `finder` (a function, or a CSS selector).
   * Works at document-start: observes <html> (which always exists) and re-checks at
   * most once per animation frame. Cleans up on timeout and if destroyed mid-wait.
   */
  function waitFor(finder, timeout) {
    const check =
      typeof finder === 'function'
        ? finder
        : function () {
            return document.querySelector(finder);
          };
    return new Promise(function (resolve, reject) {
      const found = check();
      if (found) return resolve(found);
      let queued = false;
      // obs and timer use each other, but only inside callbacks that run later (after both
      // lines below have run), so const is safe even though timer is declared second.
      const obs = new MutationObserver(function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          const result = check();
          if (result) {
            obs.disconnect();
            clearTimeout(timer);
            resolve(result);
          }
        });
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(function () {
        obs.disconnect();
        reject(new Error('waitFor timeout'));
      }, timeout || 15000);
      controller.signal.addEventListener('abort', function () {
        obs.disconnect();
        clearTimeout(timer);
      });
    });
  }

  // Lowercase + collapse whitespace, so "Creative  Studios\n" === "creative studios".
  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // First element matching `selector` whose text is exactly `text` (normalised).
  function findByText(selector, text) {
    return (
      Array.prototype.find.call(document.querySelectorAll(selector), function (n) {
        return norm(n.textContent) === norm(text);
      }) || null
    );
  }

  // Trimmed text of the first `selector` match inside `root`, or '' if missing.
  function textOf(root, selector) {
    const n = root.querySelector(selector);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // Real image URL. ShortPixel lazy-loads: until then `src` is an SVG placeholder whose
  // `data-u` attribute holds the encoded real URL.
  function imageUrl(img) {
    if (!img) return '';
    const src = img.currentSrc || img.src || '';
    if (src.indexOf('data:image/svg+xml;base64,') !== 0) return src;
    try {
      const m = atob(src.split(',')[1]).match(/data-u="([^"]+)"/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Tiny DOM builder (same as Task 1): el('a', { class: 'x', href: '/y', text: 'Hi' }, [children]).
   * `text` sets textContent (never innerHTML, so scraped text can't inject markup);
   * null children are skipped, so optional parts can be `cond ? el(...) : null`.
   * Gotchas learned in Task 1:
   * - everything else goes through setAttribute, so boolean attributes are ON whenever
   *   present ({ hidden: false } still hides) — set .hidden / .disabled / .inert as properties;
   * - data-* values come back from `dataset` as strings — Number() them before maths.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  /* ---------------------------------------------------------------- scraping */

  /**
   * Case studies from the "Work" slider, in slider order, one per URL (slider libraries
   * clone slides for looping). Each card carries two tags: [service, industry].
   * The industry is shown as the card has it (e.g. "Tech & Telcoms"); no need to map it
   * onto the sector list like Task 1, because nothing here compares industries.
   * @returns {{title: string, url: string, image: string, service: string, industry: string}[]}
   */
  function getCaseStudies() {
    const seen = {};
    return Array.prototype.reduce.call(
      FIND.workCards() || [],
      function (list, card) {
        const link = card.querySelector('.content-card__link');
        if (!link || seen[link.href]) return list;
        seen[link.href] = true;
        const tags = Array.prototype.map.call(card.querySelectorAll('.content-tags li'), function (li) {
          return li.textContent.trim();
        });
        list.push({
          title: textOf(card, '.content-card__title'),
          url: link.href,
          image: imageUrl(card.querySelector('img')),
          service: tags[0] || '',
          industry: tags[1] || ''
        });
        return list;
      },
      []
    );
  }

  /**
   * Service descriptions from the "Solutions" menu, keyed by normalised service name so a
   * case study's service tag can look its description up: descriptions[norm(cs.service)].
   * @returns {Object<string, string>}
   */
  function getServiceDescriptions() {
    const map = {};
    Array.prototype.forEach.call(FIND.solutionsLinks() || [], function (a) {
      map[norm(textOf(a, '.site-navigation__submenu-link-title'))] = textOf(
        a,
        '.site-navigation__submenu-link-description'
      );
    });
    return map;
  }

  /* ---------------------------------------------------------------- build */

  let data = null; // { caseStudies, descriptions }, filled once the page is ready
  let isOpen = false;

  // References to our long-lived elements, so behaviour code never has to search for them.
  const root = {
    overlay: null,
    drawer: null,
    toggle: null,
    panel: null,
    track: null,
    counter: null,
    prev: null,
    next: null
  };

  /*
   * One slide (Figure 4's card, with the brief's image on top):
   *   image → industry tag (tooltip) → title → service description → "View case study"
   * The tag is a <button>, not a <span>, so it can be focused: the CSS tooltip (PLAN 2.6)
   * then also opens on keyboard focus and on tap, not only on mouse hover.
   * data-tooltip holds the text the CSS shows; aria-label gives screen readers the same
   * information, because CSS-generated content isn't reliably read out.
   * Missing image or description → that part is skipped (el() ignores null children).
   */
  function buildSlide(cs, descriptions) {
    const description = descriptions[norm(cs.service)] || '';
    const tooltip = [cs.service, cs.industry].filter(Boolean).join(' · ');

    return el('article', { class: NS + '-slide' }, [
      cs.image
        ? el('img', { class: NS + '-slide__image', src: cs.image, alt: '', loading: 'lazy', decoding: 'async' })
        : null,
      el('div', { class: NS + '-slide__body' }, [
        cs.industry
          ? el(
              'button',
              {
                class: NS + '-tag',
                type: 'button',
                'data-tooltip': tooltip,
                'aria-label': 'Industry: ' + cs.industry + '. Service: ' + cs.service
              },
              [
                document.createTextNode(cs.industry + ' '),
                el('span', { class: NS + '-tag__icon', 'aria-hidden': 'true', text: 'ⓘ' }) // ⓘ
              ]
            )
          : null,
        el('h3', { class: NS + '-slide__title', text: cs.title }),
        description ? el('p', { class: NS + '-slide__description', text: description }) : null,
        // The aria-label names the case study: ten links all called "View case study"
        // can't be told apart in a screen reader's list of links.
        el('a', {
          class: NS + '-slide__link',
          href: cs.url,
          text: 'View case study',
          'aria-label': 'View case study: ' + cs.title
        })
      ])
    ]);
  }

  /*
   * Builds the overlay and the drawer once, appends them to <body>, and keeps references
   * in `root`. Both top-level elements carry data-gain="gd", which is how destroy() finds
   * them. Behaviour (toggle, arrows, drag) is wired after this, in the waitFor().then().
   *
   *   .gd-overlay
   *   aside.gd-drawer
   *     .gd-tab                (absolutely positioned on top of the panel, see the CSS)
   *       button.gd-tab__toggle     "Our work" + chevron
   *       .gd-tab__nav              ‹  1/3  ›   (only visible while open)
   *     .gd-panel#gd-panel
   *       .gd-track                 the slides
   *
   * Lenis (learned in Task 1): the site's smooth scroll takes over wheel/trackpad gestures.
   * `data-lenis-prevent-horizontal` on the track hands horizontal swipes back to the
   * slider, while vertical wheel still scrolls the page. Page scroll is NOT locked while
   * open: "close when scrolling hits the bottom" needs the page to scroll.
   */
  function build() {
    const overlay = el('div', { class: NS + '-overlay', 'data-gain': NS, 'aria-hidden': 'true' });

    const toggle = el(
      'button',
      { class: NS + '-tab__toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': NS + '-panel' },
      [
        el('span', { class: NS + '-tab__label', text: 'Our work' }),
        el('span', { class: NS + '-chevron', 'aria-hidden': 'true' })
      ]
    );

    const prev = el('button', { class: NS + '-tab__arrow', type: 'button', 'aria-label': 'Previous page', text: '‹' }); // ‹
    const next = el('button', { class: NS + '-tab__arrow', type: 'button', 'aria-label': 'Next page', text: '›' }); // ›
    // aria-live: screen readers announce "2/3" when the page changes
    const counter = el('span', { class: NS + '-tab__counter', 'aria-live': 'polite' });

    const track = el(
      'div',
      { class: NS + '-track', 'data-lenis-prevent-horizontal': '' },
      data.caseStudies.map(function (cs) {
        return buildSlide(cs, data.descriptions);
      })
    );
    const panel = el('div', { class: NS + '-panel', id: NS + '-panel' }, [track]);

    const drawer = el('aside', { class: NS + '-drawer', 'data-gain': NS, 'aria-label': 'Our work' }, [
      el('div', { class: NS + '-tab' }, [toggle, el('div', { class: NS + '-tab__nav' }, [prev, counter, next])]),
      panel
    ]);

    root.overlay = overlay;
    root.drawer = drawer;
    root.toggle = toggle;
    root.panel = panel;
    root.track = track;
    root.counter = counter;
    root.prev = prev;
    root.next = next;

    document.body.append(overlay, drawer);
  }

  /* ---------------------------------------------------------------- behaviour */

  /*
   * The one place the open state changes (tab, overlay, Esc, page bottom all call this).
   * - A class on <html> drives the CSS: the drawer slides, the chevron turns, the overlay
   *   fades, the tab turns white and shows the page nav.
   * - aria-expanded tells screen readers whether the toggle's panel is showing.
   * - `inert` on the closed panel: it's off-screen but still in the DOM, so without this
   *   Tab would walk through 20 invisible links. Set as a property (see el() gotchas).
   * - If focus was inside the panel when it closes (Esc, or reaching the page bottom),
   *   inert would drop it to <body>; move it back to the toggle instead.
   */
  function setOpen(open) {
    if (!root.drawer) return; // __gainDrawer.open() called before build() ran
    isOpen = open;
    document.documentElement.classList.toggle(NS + '-open', open);
    root.toggle.setAttribute('aria-expanded', String(open));
    if (!open && root.panel.contains(document.activeElement)) root.toggle.focus();
    root.panel.inert = !open;
  }

  /*
   * How many slides fit on one page, read from CSS (--gd-per-page) so the breakpoints
   * live in one place. TODO: Number(getComputedStyle(root.track).getPropertyValue('--gd-per-page'))
   */
  function slidesPerPage() {
    return 1;
  }

  function updateCounter() {
    // TODO (PLAN 2.4): page = round(scrollLeft / clientWidth) + 1,
    // total = ceil(slides / slidesPerPage()); disable prev/next at the ends.
  }

  function scrollByPage(dir) {
    // TODO (PLAN 2.4): root.track.scrollBy({ left: dir * root.track.clientWidth, behavior: 'smooth' })
    void dir;
  }

  function enableDrag(track) {
    // TODO (PLAN 2.4): pointerdown/move/up for mouse only (touch already swipes natively);
    // add .is-dragging (turns off scroll-snap) while dragging; swallow the click after a drag
    // so dragging across a link doesn't open it.
    void track;
  }

  /*
   * Close when the user scrolls to the bottom of the page.
   * Gotcha: the site lazy-renders sections and the footer (WP Rocket, content-visibility:
   * auto), so scrollHeight grows as they render — test that it closes at the real bottom,
   * not early. Lenis scrolls with window.scrollTo, which still fires `scroll`.
   */
  function closeAtPageBottom() {
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom && isOpen) setOpen(false);
  }

  /* ---------------------------------------------------------------- lifecycle */

  // Undo everything: listeners (abort), our elements, the open class.
  // (inert/aria-expanded live on our own elements, so removing them removes those too.)
  function destroy() {
    controller.abort();
    document.querySelectorAll('[data-gain="' + NS + '"]').forEach(function (n) {
      n.remove();
    });
    document.documentElement.classList.remove(NS + '-open');
    delete window[INSTANCE_KEY];
  }

  // The one global: lets a re-run destroy this instance; handy in the console
  // (__gainDrawer.open(), .data). `data` is a getter because it's filled in later.
  window[INSTANCE_KEY] = {
    destroy: destroy,
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    get data() {
      return data;
    }
  };

  waitFor(function () {
    return FIND.workCards() && FIND.solutionsLinks();
  })
    .then(function () {
      // Re-run while waiting → this instance is destroyed; building now would duplicate.
      if (controller.signal.aborted) return;
      data = { caseStudies: getCaseStudies(), descriptions: getServiceDescriptions() };
      build();
      setOpen(false); // sets the initial aria-expanded + inert

      on(root.toggle, 'click', function () {
        setOpen(!isOpen);
      });
      on(root.overlay, 'click', function () {
        setOpen(false);
      });
      on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && isOpen) setOpen(false);
      });

      // TODO (PLAN 2.4): prev/next, track scroll -> updateCounter, enableDrag(root.track)
      on(window, 'scroll', closeAtPageBottom, { passive: true });
      on(window, 'resize', updateCounter);
      void scrollByPage;
      void enableDrag;
      void slidesPerPage;
    })
    .catch(function (err) {
      console.warn('[' + NS + ']', err);
    });
})();
