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

  // TODO: fill these in after inspecting the live homepage.
  var SELECTORS = {
    workSlides: '', //          case study slides in the "Work" slider
    solutionsMenuItems: '' //   "Solutions" nav links (service name + description)
  };

  var controller = new AbortController();
  var on = function (el, type, fn, opts) {
    el.addEventListener(type, fn, Object.assign({ signal: controller.signal }, opts));
  };

  /* ---------------------------------------------------------------- helpers */

  function waitFor(selector, timeout) {
    return new Promise(function (resolve, reject) {
      var found = document.querySelector(selector);
      if (found) return resolve(found);
      var obs = new MutationObserver(function () {
        var el = document.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { obs.disconnect(); reject(new Error('waitFor timeout: ' + selector)); }, timeout || 15000);
    });
  }

  /* ---------------------------------------------------------------- scraping */

  /** @returns {{title, url, image, service, industry}[]} one per unique case study, slider order */
  function getCaseStudies() {
    // TODO: read SELECTORS.workSlides, dedupe slider clones by url
    return [];
  }

  /** @returns {Object<string, string>} service name -> description */
  function getServiceDescriptions() {
    // TODO: read SELECTORS.solutionsMenuItems
    return {};
  }

  /* ---------------------------------------------------------------- build */

  var refs = {}; // root, overlay, tab, track, counter, prev, next
  var isOpen = false;

  function buildSlide(cs, descriptions) {
    // TODO: image, title, industry tag (button with tooltip "service · industry"),
    // service description, "View case study" link.
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

  waitFor(SELECTORS.workSlides || 'footer')
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
