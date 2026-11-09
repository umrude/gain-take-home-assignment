/**
 * Task 2 — Footer Drawer
 * Page: https://www.thisisgain.com/
 * Paste this whole file into the DevTools console. CSS: drawer.css
 *
 * Slider: native CSS scroll-snap + pointer-drag. No 3rd-party lib, so there is
 * nothing extra to load when pasting into the console.
 */
(function () {
  'use strict';

  var NS = 'gd';
  var INSTANCE_KEY = '__gainDrawer';

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

  var controller = new AbortController();
  var on = function (el, type, fn, opts) {
    el.addEventListener(type, fn, Object.assign({ signal: controller.signal }, opts));
  };

  /* ---------------------------------------------------------------- helpers */

  /**
   * Resolves with the first truthy result of `finder` (a function, or a CSS selector).
   * Works at document-start: observes <html> and re-checks at most once per frame.
   */
  function waitFor(finder, timeout) {
    var check = typeof finder === 'function' ? finder : function () { return document.querySelector(finder); };
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
          if (result) { obs.disconnect(); clearTimeout(timer); resolve(result); }
        });
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      var timer = setTimeout(function () { obs.disconnect(); reject(new Error('waitFor timeout')); }, timeout || 15000);
      controller.signal.addEventListener('abort', function () { obs.disconnect(); clearTimeout(timer); });
    });
  }

  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // First element matching `selector` whose text is exactly `text` (normalised).
  function findByText(selector, text) {
    return Array.prototype.find.call(document.querySelectorAll(selector), function (n) {
      return norm(n.textContent) === norm(text);
    }) || null;
  }

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
    } catch (e) { return ''; }
  }

  /* ---------------------------------------------------------------- scraping */

  /**
   * Work cards carry two tags: [service, industry]. Slider clones are dropped by URL.
   * @returns {{title, url, image, service, industry}[]} one per unique case study, slider order
   */
  function getCaseStudies() {
    var seen = {};
    return Array.prototype.reduce.call(FIND.workCards() || [], function (list, card) {
      var link = card.querySelector('.content-card__link');
      if (!link || seen[link.href]) return list;
      seen[link.href] = true;
      var tags = Array.prototype.map.call(card.querySelectorAll('.content-tags li'), function (li) { return li.textContent.trim(); });
      list.push({
        title: textOf(card, '.content-card__title'),
        url: link.href,
        image: imageUrl(card.querySelector('img')),
        service: tags[0] || '',
        industry: tags[1] || ''
      });
      return list;
    }, []);
  }

  /** @returns {Object<string, string>} normalised service name -> description */
  function getServiceDescriptions() {
    var map = {};
    Array.prototype.forEach.call(FIND.solutionsLinks() || [], function (a) {
      map[norm(textOf(a, '.site-navigation__submenu-link-title'))] = textOf(a, '.site-navigation__submenu-link-description');
    });
    return map;
  }

  /* ---------------------------------------------------------------- build */

  var refs = {}; // root, overlay, tab, track, counter, prev, next
  var isOpen = false;

  function buildSlide(cs, descriptions) {
    // TODO: image, title, industry tag (button with tooltip "service · industry"),
    // service description (descriptions[norm(cs.service)]), "View case study" link.
    var slide = document.createElement('article');
    slide.className = NS + '-slide';
    void cs; void descriptions;
    return slide;
  }

  function build(caseStudies, descriptions) {
    // TODO: markup
    // <div class="gd-overlay" data-gain="gd"></div>
    // <aside class="gd-drawer" data-gain="gd">
    //   <div class="gd-tab">
    //     <button class="gd-tab__toggle" aria-expanded="false">Case studies <span class="gd-chevron"></span></button>
    //     <div class="gd-tab__nav"> prev  "1/3"  next </div>   (only visible when open)
    //   </div>
    //   <div class="gd-panel"><div class="gd-track"> ...slides </div></div>
    // </aside>
    void caseStudies; void descriptions; void buildSlide;
  }

  /* ---------------------------------------------------------------- behaviour */

  function setOpen(open) {
    isOpen = open;
    document.documentElement.classList.toggle(NS + '-open', open);
    // TODO: aria-expanded on toggle, inert on the panel when closed
  }

  function slidesPerPage() {
    // Derived from CSS (slide width vs track width) so breakpoints live in one place.
    // TODO
    return 1;
  }

  function updateCounter() {
    // TODO: page = round(scrollLeft / clientWidth) + 1, total = ceil(slides / slidesPerPage())
    // disable prev/next at the ends
  }

  function scrollByPage(dir) {
    // TODO: refs.track.scrollBy({ left: dir * refs.track.clientWidth, behavior: 'smooth' })
    void dir;
  }

  function enableDrag(track) {
    // TODO: pointerdown/move/up with mouse only (touch already swipes natively);
    // disable scroll-snap while dragging, suppress click after a drag.
    void track;
  }

  function closeAtPageBottom() {
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom && isOpen) setOpen(false);
  }

  /* ---------------------------------------------------------------- lifecycle */

  function destroy() {
    controller.abort();
    document.querySelectorAll('[data-gain="' + NS + '"]').forEach(function (n) { n.remove(); });
    document.documentElement.classList.remove(NS + '-open');
    delete window[INSTANCE_KEY];
  }

  window[INSTANCE_KEY] = { destroy: destroy, open: function () { setOpen(true); }, close: function () { setOpen(false); } };

  waitFor(function () { return FIND.workCards() && FIND.solutionsLinks(); })
    .then(function () {
      if (controller.signal.aborted) return;
      build(getCaseStudies(), getServiceDescriptions());
      // TODO: wire tab toggle, overlay click, prev/next, track scroll -> updateCounter, enableDrag
      on(window, 'scroll', closeAtPageBottom, { passive: true });
      on(window, 'resize', updateCounter);
      void scrollByPage; void enableDrag;
    })
    .catch(function (err) { console.warn('[' + NS + ']', err); });
})();
