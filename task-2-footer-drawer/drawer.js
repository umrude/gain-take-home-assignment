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

  var NS = 'gd';
  var INSTANCE_KEY = '__gainDrawer';

  // Re-run safety: tear down the previous instance (elements, listeners) first.
  if (window[INSTANCE_KEY] && typeof window[INSTANCE_KEY].destroy === 'function') {
    window[INSTANCE_KEY].destroy();
  }

  /*
   * Where things live on the page. Layout wrappers are generic (`wp-block-group`), so each
   * finder anchors on a visible label ("Work", "Solutions") or a component class
   * (`content-card`, `site-navigation__*`). Returns the element(s) or null.
   */
  var FIND = {
    // Cards in the first content slider after the "Work" heading.
    workCards: function () {
      var heading = findByText('main h2', 'Work');
      if (!heading) return null;
      var slider = Array.prototype.find.call(document.querySelectorAll('.content-slider'), function (s) {
        return heading.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING;
      });
      var cards = slider && slider.querySelectorAll('.content-card');
      return cards && cards.length ? cards : null;
    },
    // "Solutions" item in the top nav -> its submenu links (title + description).
    solutionsLinks: function () {
      var link = findByText('.site-navigation__link', 'Solutions');
      var item = link && link.closest('.site-navigation__item');
      var links = item && item.querySelectorAll('.site-navigation__submenu-link');
      return links && links.length ? links : null;
    }
  };

  /*
   * Every listener goes through on(), registered with one AbortController, so destroy()
   * removes them all with controller.abort() — including the window scroll/resize ones,
   * which would otherwise outlive our elements. `opts` allows e.g. { passive: true }.
   */
  var controller = new AbortController();
  var on = function (el, type, fn, opts) {
    el.addEventListener(type, fn, Object.assign({ signal: controller.signal }, opts));
  };

  /* ---------------------------------------------------------------- helpers */

  /**
   * Resolves with the first truthy result of `finder` (a function, or a CSS selector).
   * Works at document-start: observes <html> (which always exists) and re-checks at
   * most once per animation frame. Cleans up on timeout and if destroyed mid-wait.
   */
  function waitFor(finder, timeout) {
    var check =
      typeof finder === 'function'
        ? finder
        : function () {
            return document.querySelector(finder);
          };
    return new Promise(function (resolve, reject) {
      var found = check();
      if (found) return resolve(found);
      var queued = false;
      var obs = new MutationObserver(function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          var result = check();
          if (result) {
            obs.disconnect();
            clearTimeout(timer);
            resolve(result);
          }
        });
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      var timer = setTimeout(function () {
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
    var n = root.querySelector(selector);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // Real image URL. ShortPixel lazy-loads: until then `src` is an SVG placeholder whose
  // `data-u` attribute holds the encoded real URL.
  function imageUrl(img) {
    if (!img) return '';
    var src = img.currentSrc || img.src || '';
    if (src.indexOf('data:image/svg+xml;base64,') !== 0) return src;
    try {
      var m = atob(src.split(',')[1]).match(/data-u="([^"]+)"/);
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
    var node = document.createElement(tag);
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
    var seen = {};
    return Array.prototype.reduce.call(
      FIND.workCards() || [],
      function (list, card) {
        var link = card.querySelector('.content-card__link');
        if (!link || seen[link.href]) return list;
        seen[link.href] = true;
        var tags = Array.prototype.map.call(card.querySelectorAll('.content-tags li'), function (li) {
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
    var map = {};
    Array.prototype.forEach.call(FIND.solutionsLinks() || [], function (a) {
      map[norm(textOf(a, '.site-navigation__submenu-link-title'))] = textOf(
        a,
        '.site-navigation__submenu-link-description'
      );
    });
    return map;
  }

  /* ---------------------------------------------------------------- build */

  var data = null; // { caseStudies, descriptions }, filled once the page is ready
  var isOpen = false;

  // References to our long-lived elements, so behaviour code never has to search for them.
  var root = { overlay: null, drawer: null, toggle: null, track: null, counter: null, prev: null, next: null };

  function buildSlide(cs, descriptions) {
    // TODO (PLAN 2.2): image (loading="lazy"), title, industry tag, service description
    // (descriptions[norm(cs.service)]), "View case study" link to cs.url.
    // Tag = a <button> (focusable, so the tooltip also works on keyboard focus and tap)
    // with data-tooltip="Service · Industry" — the tooltip itself is CSS (PLAN 2.6).
    return el('article', { class: NS + '-slide' });
  }

  function build() {
    // TODO (PLAN 2.2): markup — mark every root element with data-gain="gd" (destroy()
    // removes by that), and store references in `root`.
    //
    // <div class="gd-overlay" data-gain="gd"></div>
    // <aside class="gd-drawer" data-gain="gd" aria-label="Case studies">
    //   <div class="gd-tab">                       (absolutely positioned on top of the panel)
    //     <button class="gd-tab__toggle" aria-expanded="false" aria-controls="gd-panel">
    //       Case studies <span class="gd-chevron" aria-hidden="true"></span>
    //     </button>
    //     <div class="gd-tab__nav"> prev  "1/3"  next </div>   (only visible when open)
    //   </div>
    //   <div class="gd-panel" id="gd-panel">
    //     <div class="gd-track" data-lenis-prevent-horizontal> ...slides </div>
    //   </div>
    // </aside>
    //
    // Lenis (learned in Task 1): the site's Lenis smooth-scroll hijacks wheel/trackpad
    // gestures. `data-lenis-prevent-horizontal` on the track lets horizontal trackpad
    // swipes scroll the slider natively, while vertical wheel still scrolls the page.
    // Don't lock page scroll while open: "close when scrolling hits the bottom" needs it.
    void buildSlide;
  }

  /* ---------------------------------------------------------------- behaviour */

  /*
   * One class on <html> drives the open state; CSS animates the slide and the chevron.
   * TODO (PLAN 2.3): aria-expanded on the toggle; root.drawer panel `inert` when closed
   * (property, not attribute — see el() gotchas) so hidden slides can't be tabbed to;
   * Esc closes (as in Task 1).
   */
  function setOpen(open) {
    isOpen = open;
    document.documentElement.classList.toggle(NS + '-open', open);
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
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom && isOpen) setOpen(false);
  }

  /* ---------------------------------------------------------------- lifecycle */

  // Undo everything: listeners (abort), our elements, the open class.
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
      // TODO (PLAN 2.3/2.4): wire tab toggle, overlay click, Esc, prev/next,
      // track scroll -> updateCounter, enableDrag(root.track)
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
