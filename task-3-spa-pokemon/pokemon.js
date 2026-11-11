/**
 * Task 3 — SPA DOM Manipulation (Pokémon)
 * Page: https://www.thisisgain.com/blog/
 * Paste this whole file into the DevTools console. CSS: pokemon.css
 *
 * Strategy:
 * - CSS hides original article cards until they're marked [data-gp-ready], so
 *   article content never flashes (works even before this JS runs).
 * - A MutationObserver on the list re-applies changes whenever React re-renders
 *   (paging, filtering, back/forward); no history hooks needed (see observe()).
 * - We never remove React's nodes; we hide their contents and append our own
 *   card inside, so React's reconciliation doesn't break.
 */
(function () {
  'use strict';

  const NS = 'gp';
  const INSTANCE_KEY = '__gainPokemon';
  const PER_PAGE = 12;
  const API = 'https://pokeapi.co/api/v2/pokemon/';
  /*
   * The 18 regular types, as the brief asks ("listing the 18 regular Pokémon types"), in
   * the games' order. Deliberately not fetched from /api/v2/type/: that also returns
   * stellar (a Tera-only type), unknown and shadow, which no Pokémon has as its type, so
   * they'd need filtering out by a hardcoded rule anyway. A fixed list also means the
   * dropdown appears straight away and keeps working if PokeAPI is slow or down.
   */
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
   * so they're more stable than layout classes.
   * The filters are two native <select>s that React renders side by side in
   * `.filter-dropdown`, with no <label> ("Filter by Tags" is a placeholder <option>).
   * The CSS hides both by their `name` (post_tag, capability), so JS never touches them.
   */
  const CARD = '[data-behaviour="listing"] .listing-box'; // also used in pokemon.css
  const FIND = {
    // Wraps filters + list; React may swap the <ul> inside, so observe this instead.
    root: function () {
      return document.getElementById('archive-listing');
    },
    // A <div> holding the cards' <ul> AND the page numbers' <nav>, not the <ul> itself
    list: function () {
      return document.querySelector('[data-behaviour="listing"]');
    },
    // The <ul> of cards; the empty message goes right after it, above the page numbers
    grid: function () {
      return document.querySelector('[data-behaviour="listing"] > ul');
    },
    cards: function () {
      return document.querySelectorAll(CARD);
    },
    // Holds React's two <select>s; our "Filter by type" <select> goes in here too (setupFilters)
    dropdowns: function () {
      return document.querySelector('[data-behaviour="listing-filters"] .filter-dropdown');
    },
    // React's "Filter by Capability" <select> (hidden by the CSS); ours goes right after it
    capabilityFilter: function () {
      return document.querySelector('[data-behaviour="listing-filters"] select[name="capability"]');
    }
  };

  // PokeAPI stat names → the short labels the games use
  const STAT_LABELS = {
    hp: 'HP',
    attack: 'Atk',
    defense: 'Def',
    'special-attack': 'SpA',
    'special-defense': 'SpD',
    speed: 'Spe'
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

  /**
   * Tiny DOM builder (same as Tasks 1 and 2): el('a', { class: 'x', href: '/y', text: 'Hi' }, [children]).
   * `text` sets textContent (never innerHTML, so API text can't inject markup);
   * null children are skipped, so optional parts can be `cond ? el(...) : null`.
   * Gotchas learned in Task 1:
   * - everything else goes through setAttribute, so boolean attributes are ON whenever
   *   present ({ hidden: false } still hides): set .hidden / .disabled as properties;
   * - data-* values come back from `dataset` as strings: Number() them before maths.
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

  function capitalise(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  /*
   * The "no Pokémon of this type" message. Built once and placed right AFTER React's <ul>
   * (so it's where the cards would be, above the page numbers), not inside it, so React's
   * list only ever holds React's <li>s. If React ever replaces the <ul>, the message is
   * put back next to the new one.
   */
  let emptyMessage = null;
  function getEmptyMessage() {
    const grid = FIND.grid();
    if (!grid) return null;
    if (!emptyMessage) emptyMessage = el('p', { class: NS + '-empty', 'data-gain': NS, role: 'status' });
    if (emptyMessage.previousElementSibling !== grid) grid.after(emptyMessage);
    return emptyMessage;
  }

  /*
   * Shows only the cards of the chosen type ON THE CURRENT PAGE (no type: all of them).
   * Runs after every card renders and on every dropdown change, so it just recomputes
   * everything from scratch each time instead of tracking what changed.
   */
  function applyTypeFilter() {
    const type = selectedType();
    const cards = Array.from(FIND.cards());

    cards.forEach(function (card) {
      const gpCard = card.querySelector(':scope > .' + NS + '-card');
      // "grass poison" → ['grass', 'poison']. Error and still-loading cards have no types.
      const types = gpCard ? (gpCard.getAttribute('data-' + NS + '-types') || '').split(' ') : [];
      // toggle(name, force): adds the class when force is true, removes it when false
      card.classList.toggle(NS + '-hidden', type !== '' && !types.includes(type));
    });

    const empty = getEmptyMessage();
    if (empty) {
      // Wait until every card has loaded, or the message would flash while they arrive
      const allLoaded = cards.every(function (card) {
        return card.hasAttribute('data-' + NS + '-ready');
      });
      const noneShown = cards.every(function (card) {
        return card.classList.contains(NS + '-hidden');
      });
      if (type) empty.textContent = 'No ' + capitalise(type) + ' Pokémon on this page.';
      empty.hidden = !(type && allLoaded && noneShown); // a property, not setAttribute (el() gotcha)
    }

    // Keep the dropdown showing the stored type (e.g. after a re-run)
    const select = document.querySelector('.' + NS + '-type-filter');
    if (select && select.value !== type) select.value = type;
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

  /*
   * Turns one of React's article cards (`card`, an <li class="listing-box">) into a
   * Pokémon. We never remove or edit React's own children (the CSS hides them); we
   * append our .gp-card inside the <li>. React replaces the whole <li> when paging, so
   * our card goes with it and React never trips over our nodes.
   *
   * Target markup (pokemon.css is written against this):
   *
   * <div class="gp-card" role="button" tabindex="0" aria-pressed="false"
   *      aria-label="Bulbasaur, number 1. Show details" data-gp-types="grass poison">
   *   <div class="gp-card__inner">                       (this is what flips)
   *     <div class="gp-card__face gp-card__front">
   *       <div class="gp-card__media">
   *         <img class="gp-card__image" src="…official-artwork…" alt="" width="475" height="475">
   *       </div>
   *       <p class="gp-card__number">#0001</p>
   *       <h2 class="gp-card__name">Bulbasaur</h2>       (h2, like the site's card titles)
   *       <ul class="gp-card__types">
   *         <li class="gp-tag gp-tag--grass">Grass</li>  (one per type, in PokeAPI order)
   *       </ul>
   *     </div>
   *     <div class="gp-card__face gp-card__back">
   *       <h3 class="gp-card__back-title">Bulbasaur</h3>
   *       <dl class="gp-card__facts">
   *         <div><dt>Height</dt><dd>0.7 m</dd></div>    (PokeAPI height is in decimetres)
   *         <div><dt>Weight</dt><dd>6.9 kg</dd></div>   (weight is in hectograms)
   *         <div><dt>Abilities</dt><dd class="gp-card__abilities">overgrow, chlorophyll</dd></div>
   *       </dl>
   *       <ul class="gp-stats">                          (one per p.stats entry)
   *         <li class="gp-stat" style="--value: 45">     (base_stat; the bar is drawn in CSS)
   *           <span class="gp-stat__label">HP</span><span class="gp-stat__value">45</span>
   *         </li>
   *       </ul>
   *     </div>
   *   </div>
   * </div>
   *
   * data-gp-types: the FIRST type picks the card's accent colour in CSS ([data-gp-types^="fire"]),
   * and applyTypeFilter() matches on the whole list.
   * data-gp-cry: the Pokémon's cry (PokeAPI audio URL), played when the card flips to its back.
   */
  function renderCard(card, index) {
    const id = (currentPage() - 1) * PER_PAGE + index + 1;
    if (card.getAttribute('data-' + NS + '-id') === String(id)) return; // already done
    card.setAttribute('data-' + NS + '-id', String(id));
    card.removeAttribute('data-' + NS + '-ready');

    getPokemon(id)
      .then(function (p) {
        if (card.getAttribute('data-' + NS + '-id') !== String(id)) return; // card reused meanwhile
        const { name, id: pokemonId, types, stats, abilities, cries, sprites, height, weight } = p;
        const pokemonNumber = String(pokemonId).padStart(4, '0'); // 1 → "0001"
        const pokemonName = name.charAt(0).toUpperCase() + name.slice(1); // API names are lowercase
        // Official artwork is large and smooth; the plain sprite (96px pixel art) is the fallback
        const image = sprites.other['official-artwork'].front_default || sprites.front_default || '';

        const cardFront = el('div', { class: NS + '-card__face ' + NS + '-card__front' }, [
          el('div', { class: NS + '-card__media' }, [
            // alt="": the name is right below (and in the card's aria-label), so it isn't read twice.
            // width/height: the browser reserves the space before it loads, so cards don't jump.
            el('img', { class: NS + '-card__image', src: image, alt: '', width: '475', height: '475' })
          ]),
          el('p', { class: NS + '-card__number', text: '#' + pokemonNumber }),
          el('h2', { class: NS + '-card__name', text: pokemonName }),
          el(
            'ul',
            { class: NS + '-card__types' },
            types.map((t) => el('li', { class: NS + '-tag ' + NS + '-tag--' + t.type.name, text: t.type.name }))
          )
        ]);

        const cardBack = el('div', { class: NS + '-card__face ' + NS + '-card__back' }, [
          el('h3', { class: NS + '-card__back-title', text: pokemonName }),
          el('dl', { class: NS + '-card__facts' }, [
            el('div', {}, [el('dt', { text: 'Height' }), el('dd', { text: `${height / 10} m` })]),
            el('div', {}, [el('dt', { text: 'Weight' }), el('dd', { text: `${weight / 10} kg` })]),
            el('div', {}, [
              el('dt', { text: 'Abilities' }),
              el('dd', {
                class: NS + '-card__abilities',
                // "swift-swim" → "Swift Swim"
                text: abilities
                  .map((a) =>
                    a.ability.name
                      .split('-')
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ')
                  )
                  .join(', ')
              })
            ])
          ]),
          el(
            'ul',
            { class: NS + '-stats' },
            stats.map((s) =>
              // --value drives the bar's width in CSS (out of 255, the highest base stat)
              el('li', { class: NS + '-stat', style: `--value: ${s.base_stat}` }, [
                el('span', { class: NS + '-stat__label', text: STAT_LABELS[s.stat.name] || s.stat.name }),
                el('span', { class: NS + '-stat__value', text: s.base_stat })
              ])
            )
          )
        ]);

        const attrs = {
          class: NS + '-card',
          role: 'button', // announced as something you can press
          tabindex: '0', // in the normal tab order (a positive number would jump it ahead of the page)
          'aria-pressed': 'false', // flipped or not (onListClick keeps it in sync)
          'aria-label': `${pokemonName}, number ${pokemonId}. Show details`,
          ['data-' + NS + '-types']: types.map((t) => t.type.name).join(' ') // "grass poison"
        };
        if (cries && cries.latest) attrs['data-' + NS + '-cry'] = cries.latest; // some have no cry
        const cardContent = el('div', attrs, [el('div', { class: NS + '-card__inner' }, [cardFront, cardBack])]);

        showCard(card, cardContent);
        applyTypeFilter();
      })
      .catch(function (err) {
        console.warn('[' + NS + '] #' + id, err);
        // A visible error card, not an invisible one (the anti-flash CSS hides a card until it's ready)
        showCard(card, el('div', { class: NS + '-card ' + NS + '-card--error', text: `Couldn't load Pokémon #${id}` }));
        applyTypeFilter(); // an error card can be the last one to finish loading
      });
  }

  /*
   * Puts our card into React's <li> and reveals it. APPEND, never replaceChildren():
   * React still holds references to its own children (link, image, title). If they were
   * removed, React's next update to this <li> could call insertBefore/removeChild on a node
   * that isn't there any more and throw, breaking paging. The CSS hides React's children.
   */
  function showCard(card, content) {
    const previous = card.querySelector(':scope > .' + NS + '-card'); // only OUR earlier card
    if (previous) previous.remove();
    card.appendChild(content);
    card.setAttribute('data-' + NS + '-ready', '');
  }

  function processList() {
    FIND.cards().forEach(renderCard);
  }

  /* ---------------------------------------------------------------- filters */

  /*
   * "Turn the Filter by Capability dropdown into Filter by type": the CSS hides React's
   * capability <select>, and ours takes its exact place (inserted right after it).
   * Why not edit React's <select> itself: it's React's (props name/value/onChange), and
   * its onChange POSTs to admin-ajax.php?action=list_results and swaps the article list.
   * Picking "fire" there would ask the server for capability "fire" and clear the cards,
   * while the brief wants "only the Pokémon of that type ON THE CURRENT PAGE". Blocking that
   * would need stopPropagation (hiding the filter from analytics), and React would still
   * restore its own value/options whenever it re-renders. Ours is invisible to React.
   * React doesn't redraw the filters when paging (a DevTools "subtree modifications"
   * breakpoint on them never fired), so ours stays put and keeps its value. Still, this is
   * safe to call repeatedly (the observer does) and only adds ours if it's missing.
   */
  function setupFilters() {
    const dropdowns = FIND.dropdowns();
    if (!dropdowns || dropdowns.querySelector('.' + NS + '-type-filter')) return; // not rendered yet, or already done

    // "Filter by type" (value "") is the placeholder, like the site's; picking it again shows every type
    const options = [el('option', { value: '', text: 'Filter by type' })].concat(
      TYPES.map((type) => el('option', { value: type, text: capitalise(type) }))
    );
    // data-gain="gp": destroy() removes it on a re-run, so there's never a second, dead dropdown
    const typeFilter = el(
      'select',
      { class: NS + '-type-filter', 'data-gain': NS, 'aria-label': 'Filter by type' },
      options
    );

    const capability = FIND.capabilityFilter();
    if (capability)
      capability.after(typeFilter); // takes the hidden capability dropdown's exact place
    else dropdowns.append(typeFilter);

    typeFilter.value = selectedType();
    on(typeFilter, 'change', function () {
      setSelectedType(typeFilter.value);
    });
  }

  /* ---------------------------------------------------------------- interactions */

  /*
   * Plays a Pokémon's cry. play() returns a promise that rejects if the browser blocks
   * audio or the file fails to load; without the catch that's an "Uncaught (in promise)"
   * error in the console. A missing cry is harmless, so it's ignored.
   */
  function playAudio(url) {
    const audio = new Audio(url);
    audio.volume = 0.4;
    audio.play().catch(function () {});
    return audio;
  }

  /*
   * Flips a card to its other side; flipping to the back plays the cry. Takes no event,
   * so it can also be called on its own (e.g. from the console or a test).
   * The class is prefixed (gp-card--flipped), not a generic `is-flipped`: in Task 2 an
   * unprefixed `is-open` picked up a rule from the site's own CSS and turned a tooltip
   * upside down. aria-pressed tells screen readers which side is showing.
   */
  function flipCard(card) {
    const flipped = card.classList.toggle(NS + '-card--flipped');
    card.setAttribute('aria-pressed', String(flipped));
    const cry = card.getAttribute('data-' + NS + '-cry');
    if (cry && flipped) playAudio(cry);
  }

  /*
   * Click on a card: flip it. Error cards don't flip.
   * Nothing needs blocking, so no preventDefault/stopPropagation. The article link is
   * hidden (CSS), so the click lands on OUR card, which isn't inside the link; and React
   * has no click handlers on the cards (checked: the <li> and link have React props but no
   * onClick; the page's only React root is the filters). Not stopping propagation matters
   * on a site running A/B tests: the site's own `document` click listeners (analytics, tag
   * managers) keep seeing card clicks, so the variant is measured like the original.
   * (Verified: with stopPropagation they saw 0 clicks, without it 1; flip and URL the same.)
   */
  function onListClick(e) {
    const card = e.target.closest('.' + NS + '-card');
    if (!card || card.classList.contains(NS + '-card--error')) return;
    flipCard(card);
  }

  /*
   * Keyboard: the card has role="button", so it must act like one. Enter and Space flip
   * it when the card itself has focus. preventDefault IS needed here: it stops Space from
   * scrolling the page. Propagation is left alone, as for clicks.
   * `e.repeat` ignores a held-down key, which would otherwise flip it ~30 times a second.
   */
  function onListKeyDown(e) {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    const card = e.target.closest('.' + NS + '-card');
    if (!card || e.target !== card || card.classList.contains(NS + '-card--error')) return;
    e.preventDefault();
    flipCard(card);
  }

  /* ---------------------------------------------------------------- SPA watching */

  /*
   * Watching the DOM is all it takes; no history hooks. Paging, filtering AND the browser's
   * back/forward buttons all end with React swapping the cards, which this sees. React
   * changes the URL first (checked for paging and back/forward), so currentPage() is already
   * right when it fires. Wrapping history.pushState instead would patch a global the site
   * and its analytics also use, to learn something the cards already tell us.
   * No endless loop from our own changes: they trigger this again, but on that pass every
   * card already has its Pokémon and the dropdown exists, so nothing new is done.
   */
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
      n.classList.remove(NS + '-hidden');
    });
    // React's own <select>s need nothing: the CSS hides them, we never touched them
    delete window[INSTANCE_KEY];
  }

  // The one global: lets a re-run destroy this instance; handy in the console
  // (__gainPokemon.cache[1], __gainPokemon.currentPage()).
  window[INSTANCE_KEY] = {
    destroy: destroy,
    cache: cache,
    currentPage: currentPage
  };

  waitFor(FIND.root)
    .then(function (root) {
      if (controller.signal.aborted) return;
      setupFilters();
      processList();
      observe(root);
      // One listener each on the wrapper (event delegation), so cards React adds later work too
      on(root, 'click', onListClick);
      on(root, 'keydown', onListKeyDown);
    })
    .catch(function (err) {
      console.warn('[' + NS + ']', err);
    });
})();
