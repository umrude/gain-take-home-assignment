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

  const NS = 'gp';
  const INSTANCE_KEY = '__gainPokemon';
  const PER_PAGE = 12;
  const API = 'https://pokeapi.co/api/v2/pokemon/';
  const TYPES = [
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'ice',
    'fighting',
    'poison',
    'ground',
    'flying',
    'psychic',
    'bug',
    'rock',
    'ghost',
    'dragon',
    'dark',
    'steel',
    'fairy'
  ];
  const STORAGE_KEY = NS + '-type';

  if (window[INSTANCE_KEY] && typeof window[INSTANCE_KEY].destroy === 'function') {
    window[INSTANCE_KEY].destroy();
  }

  /*
   * Where things live on the page. `data-behaviour` attributes are the theme's JS hooks,
   * so they're more stable than layout classes. The filters are two native <select>s that
   * React renders side by side in `.filter-dropdown`. They have no <label>: "Filter by Tags"
   * is the first <option> (a placeholder). Their `name`s are WordPress's taxonomy names,
   * the most stable thing to select on.
   */
  const CARD = '[data-behaviour="listing"] .listing-box'; // also used in pokemon.css
  const FIND = {
    // Wraps filters + list; React may swap the <ul> inside, so observe this instead.
    root: function () {
      return document.getElementById('archive-listing');
    },
    list: function () {
      return document.querySelector('[data-behaviour="listing"]');
    },
    cards: function () {
      return document.querySelectorAll(CARD);
    },
    filters: function () {
      return document.querySelector('[data-behaviour="listing-filters"]');
    },
    // Holds both <select>s; our "Filter by type" <select> goes in here too (see setupFilters)
    dropdowns: function () {
      return document.querySelector('[data-behaviour="listing-filters"] .filter-dropdown');
    },
    tagsFilter: function () {
      return document.querySelector('[data-behaviour="listing-filters"] select[name="post_tag"]');
    },
    capabilityFilter: function () {
      return document.querySelector('[data-behaviour="listing-filters"] select[name="capability"]');
    },
    // TODO: pagination — rendered by React; check its markup and the page URL format.
    // URL format: https://www.thisisgain.com/blog/page/2/
    paginationWrapper: function () {
      return document.querySelector('.pagination');
    },
    paginationLinks: function () {
      return document.querySelectorAll('.pagination .pagination__item .pagination__link:not(.pagination__link--arrow)');
    },
    paginationPrev: function () {
      return document.querySelector('.pagination__link--prev');
    },
    paginationNext: function () {
      return document.querySelector('.pagination__link--next');
    }
  };

  const controller = new AbortController();
  const on = function (el, type, fn, opts) {
    el.addEventListener(type, fn, Object.assign({ signal: controller.signal }, opts));
  };
  const observers = [];

  /* ---------------------------------------------------------------- helpers */

  /**
   * Resolves with the first truthy result of `finder` (a function, or a CSS selector).
   * Works at document-start: observes `document` (it exists even before <html>) and re-checks at most once per frame.
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
      obs.observe(document, { childList: true, subtree: true });
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

  /* ---------------------------------------------------------------- PokeAPI (cached) */

  const cache = window.__gainPokemonCache || (window.__gainPokemonCache = {}); // survives re-runs

  /** @returns {Promise<object>} raw PokeAPI pokemon */
  function getPokemon(id) {
    if (!cache[id]) {
      cache[id] = fetch(API + id)
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .catch(function (e) {
          delete cache[id];
          throw e;
        });
    }
    return cache[id];
  }

  /* ---------------------------------------------------------------- page / filter state */

  /*
   * Page number from the URL: /blog/ is page 1, /blog/page/2/ is page 2.
   * Safe to read while rendering cards: when paging, React updates the URL BEFORE it puts
   * the new cards in (checked with a MutationObserver on the list, which logged
   * /blog/page/2/ as the cards changed), so new cards never get the old page's numbers.
   */
  function currentPage() {
    const m = location.pathname.match(/\/page\/(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }

  function selectedType() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }
  function setSelectedType(t) {
    try {
      sessionStorage.setItem(STORAGE_KEY, t);
    } catch (e) {
      /* storage blocked */
    }
    applyTypeFilter();
  }

  /* ---------------------------------------------------------------- cards */

  function renderCard(card, index) {
    const id = (currentPage() - 1) * PER_PAGE + index + 1;
    if (card.getAttribute('data-' + NS + '-id') === String(id)) return; // already done
    card.setAttribute('data-' + NS + '-id', String(id));
    card.removeAttribute('data-' + NS + '-ready');

    getPokemon(id)
      .then(function (p) {
        if (card.getAttribute('data-' + NS + '-id') !== String(id)) return; // card reused meanwhile
        // TODO: build flip card (front: image, #id, name, type tags; back: stats/height/weight/abilities)
        // append it inside `card` as .gp-card, set data-gp-types="fire flying"
        void p;
        card.setAttribute('data-' + NS + '-ready', '');
        applyTypeFilter();
      })
      .catch(function (err) {
        console.warn('[' + NS + '] #' + id, err);
      });
  }

  function processList() {
    FIND.cards().forEach(renderCard);
  }

  function applyTypeFilter() {
    // TODO: toggle .gp-hidden on cards whose data-gp-types doesn't include selectedType(),
    // show/hide the empty message, keep the <select> value in sync.
  }

  /* ---------------------------------------------------------------- filters */

  /*
   * React owns its two <select>s (their options and value), so changing them in place
   * would be undone on its next render. Instead the CSS hides both, and we add our own
   * <select> inside the same .filter-dropdown, so it picks up the site's select styling.
   * React doesn't redraw the filters when paging (a DevTools "subtree modifications"
   * breakpoint on them never fired), so ours stays put. Still, this is safe to call
   * repeatedly (the observer does) and only adds ours if it's missing: a cheap safety net.
   */
  function setupFilters() {
    // TODO (PLAN 3.4): if FIND.dropdowns() has no .gp-type-filter, append
    // <select class="gp-type-filter" aria-label="Filter by type"> with a placeholder
    // option "Filter by type" (value "", like the site's) + one option per TYPES entry;
    // set its value to selectedType(); bind change -> setSelectedType.
    void TYPES;
  }

  /* ---------------------------------------------------------------- interactions */

  function onListClick(e) {
    const card = e.target.closest('.' + NS + '-card');
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
    let scheduled = false;
    const mo = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      // Microtask: runs before the next paint, so original content isn't shown.
      queueMicrotask(function () {
        scheduled = false;
        processList();
        setupFilters();
      });
    });
    mo.observe(list, { childList: true, subtree: true });
    observers.push(mo);
  }

  /* ---------------------------------------------------------------- lifecycle */

  function destroy() {
    controller.abort();
    observers.forEach(function (o) {
      o.disconnect();
    });
    document.querySelectorAll('.' + NS + '-card, [data-gain="' + NS + '"]').forEach(function (n) {
      n.remove();
    });
    document.querySelectorAll('[data-' + NS + '-id]').forEach(function (n) {
      n.removeAttribute('data-' + NS + '-id');
      n.removeAttribute('data-' + NS + '-ready');
    });
    // TODO: restore history methods and original filter dropdown
    delete window[INSTANCE_KEY];
  }

  window[INSTANCE_KEY] = { destroy: destroy };

  waitFor(FIND.root)
    .then(function (root) {
      if (controller.signal.aborted) return;
      setupFilters();
      processList();
      observe(root);
      hookHistory();
      on(root, 'click', onListClick, { capture: true }); // capture: beat React's link handler
    })
    .catch(function (err) {
      console.warn('[' + NS + ']', err);
    });
})();
