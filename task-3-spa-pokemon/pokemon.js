/**
 * Task 3 — SPA DOM Manipulation (Pokémon)
 * Page: https://www.thisisgain.com/blog/
 * Paste this whole file into the DevTools console. CSS: pokemon.css
 *
 * Strategy:
 * - CSS hides original article cards until they're marked [data-gp-ready], so
 *   article content never flashes (works even before this JS runs).
 * - A MutationObserver on the list re-applies changes whenever React re-renders
 *   (paging / filtering), plus a history hook for URL changes.
 * - We never remove React's nodes; we hide their contents and append our own
 *   card inside, so React's reconciliation doesn't break.
 */
(function () {
  'use strict';

  var NS = 'gp';
  var INSTANCE_KEY = '__gainPokemon';
  var PER_PAGE = 12;
  var API = 'https://pokeapi.co/api/v2/pokemon/';
  var TYPES = [
    'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
    'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
  ];
  var STORAGE_KEY = NS + '-type';

  if (window[INSTANCE_KEY] && typeof window[INSTANCE_KEY].destroy === 'function') {
    window[INSTANCE_KEY].destroy();
  }

  // TODO: fill these in after inspecting the live blog page.
  var SELECTORS = {
    list: '', //            React container of the article cards
    card: '', //            one article card
    tagsFilter: '', //      "Filter by Tags" dropdown wrapper
    capabilityFilter: '', // "Filter by Capability" dropdown wrapper
    pagination: '' //       page number links
  };

  var controller = new AbortController();
  var on = function (el, type, fn, opts) {
    el.addEventListener(type, fn, Object.assign({ signal: controller.signal }, opts));
  };
  var observers = [];

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

  /* ---------------------------------------------------------------- PokeAPI (cached) */

  var cache = window.__gainPokemonCache || (window.__gainPokemonCache = {}); // survives re-runs

  /** @returns {Promise<object>} raw PokeAPI pokemon */
  function getPokemon(id) {
    if (!cache[id]) {
      cache[id] = fetch(API + id)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(function (e) { delete cache[id]; throw e; });
    }
    return cache[id];
  }

  /* ---------------------------------------------------------------- page / filter state */

  function currentPage() {
    // TODO: confirm the URL format used by the blog pagination (e.g. /blog/page/2/ or ?page=2)
    var m = location.pathname.match(/\/page\/(\d+)/) || location.search.match(/[?&]page=(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }

  function selectedType() {
    try { return sessionStorage.getItem(STORAGE_KEY) || ''; } catch (e) { return ''; }
  }
  function setSelectedType(t) {
    try { sessionStorage.setItem(STORAGE_KEY, t); } catch (e) { /* storage blocked */ }
    applyTypeFilter();
  }

  /* ---------------------------------------------------------------- cards */

  function renderCard(card, index) {
    var id = (currentPage() - 1) * PER_PAGE + index + 1;
    if (card.getAttribute('data-' + NS + '-id') === String(id)) return; // already done
    card.setAttribute('data-' + NS + '-id', String(id));
    card.removeAttribute('data-' + NS + '-ready');

    getPokemon(id).then(function (p) {
      if (card.getAttribute('data-' + NS + '-id') !== String(id)) return; // card reused meanwhile
      // TODO: build flip card (front: image, #id, name, type tags; back: stats/height/weight/abilities)
      // append it inside `card` as .gp-card, set data-gp-types="fire flying"
      void p;
      card.setAttribute('data-' + NS + '-ready', '');
      applyTypeFilter();
    }).catch(function (err) { console.warn('[' + NS + '] #' + id, err); });
  }

  function processList() {
    var cards = document.querySelectorAll(SELECTORS.card);
    cards.forEach(renderCard);
  }

  function applyTypeFilter() {
    // TODO: toggle .gp-hidden on cards whose data-gp-types doesn't include selectedType(),
    // show/hide the empty message, keep the <select> value in sync.
  }

  /* ---------------------------------------------------------------- filters */

  function setupFilters() {
    // TODO: hide SELECTORS.tagsFilter (CSS), replace capability dropdown contents with
    // our own <select> of TYPES ("Filter by type"), bind change -> setSelectedType.
    void TYPES;
  }

  /* ---------------------------------------------------------------- interactions */

  function onListClick(e) {
    var card = e.target.closest('.' + NS + '-card');
    if (!card) return;
    // Block navigation to the article and flip instead.
    e.preventDefault();
    e.stopPropagation();
    card.classList.toggle('is-flipped');
  }

  /* ---------------------------------------------------------------- SPA watching */

  function hookHistory() {
    // React Router-style navigation fires pushState/replaceState, not a load event.
    // TODO: wrap history.pushState/replaceState to dispatch a custom event; restore originals in destroy().
    on(window, 'popstate', processList);
  }

  function observe(list) {
    var scheduled = false;
    var mo = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      // Microtask: runs before the next paint, so original content isn't shown.
      queueMicrotask(function () { scheduled = false; processList(); setupFilters(); });
    });
    mo.observe(list, { childList: true, subtree: true });
    observers.push(mo);
  }

  /* ---------------------------------------------------------------- lifecycle */

  function destroy() {
    controller.abort();
    observers.forEach(function (o) { o.disconnect(); });
    document.querySelectorAll('.' + NS + '-card, [data-gain="' + NS + '"]').forEach(function (n) { n.remove(); });
    document.querySelectorAll('[data-' + NS + '-id]').forEach(function (n) {
      n.removeAttribute('data-' + NS + '-id');
      n.removeAttribute('data-' + NS + '-ready');
    });
    // TODO: restore history methods and original filter dropdown
    delete window[INSTANCE_KEY];
  }

  window[INSTANCE_KEY] = { destroy: destroy };

  waitFor(SELECTORS.list || 'main')
    .then(function (list) {
      if (controller.signal.aborted) return;
      setupFilters();
      processList();
      observe(list);
      hookHistory();
      on(list, 'click', onListClick, { capture: true }); // capture: beat React's link handler
    })
    .catch(function (err) { console.warn('[' + NS + ']', err); });
})();
