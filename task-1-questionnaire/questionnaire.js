/**
 * Task 1 — Dynamic Modal (Questionnaire)
 * Page: https://www.thisisgain.com/
 * Paste this whole file into the DevTools console. CSS: questionnaire.css
 */
(function () {
  'use strict';

  var NS = 'gq'; // class/id prefix for everything this script creates
  var INSTANCE_KEY = '__gainQuestionnaire';

  // Re-run safety: tear down the previous instance before building again.
  if (window[INSTANCE_KEY] && typeof window[INSTANCE_KEY].destroy === 'function') {
    window[INSTANCE_KEY].destroy();
  }

  /*
   * Where things live on the page. The layout wrappers are generic (`wp-block-group`),
   * so each finder anchors on something stable — the <h1>, a visible label the brief
   * names ("Solutions", "Our Sectors", "Work", "Insights"), or a component class
   * (`content-card`, `site-navigation__*`) — then searches inside it.
   * Each returns the element(s) or null, so waitFor() can poll them.
   */
  var FIND = {
    // Top-level block (direct child of <main>) that holds the <h1>.
    hero: function () {
      var h1 = document.querySelector('main h1');
      return h1 && topLevelBlock(h1);
    },
    // "Solutions" item in the top nav -> its submenu links (title + description).
    solutionsLinks: function () {
      var item = closestOf(findByText('.site-navigation__link', 'Solutions'), '.site-navigation__item');
      var links = item && item.querySelectorAll('.site-navigation__submenu-link');
      return links && links.length ? links : null;
    },
    // "Our Sectors" is a <p> label, not a heading; the sector links sit in the same columns block.
    sectorLinks: function () {
      var block = closestOf(findByText('main p', 'Our Sectors'), '.wp-block-columns');
      var links = block && block.querySelectorAll('a.wp-block-button__link');
      return links && links.length ? links : null;
    },
    // First content slider after the "Work" / "Insights" heading.
    workCards: function () { return cardsAfterHeading('Work'); },
    insightCards: function () { return cardsAfterHeading('Insights'); },
    // Footer email. Cloudflare obfuscates it (`[email protected]`) until its own script runs.
    footerEmail: function () {
      return document.querySelector('footer a[href^="mailto:"], footer [data-cfemail], footer a[href*="/email-protection#"]');
    }
  };

  // Questions 3 & 4 are defined by the brief, so they are not scraped.
  var USEFUL = { cases: 'Case studies like mine', articles: 'Articles to read', talk: 'Talk to someone' };
  var TIMING = { now: 'Right away', soon: 'In the next 3 months', exploring: 'Just exploring' };
  var HEADINGS = { now: 'Let’s talk this week', soon: 'Here’s where to start', exploring: 'Take your time' };
  var WORK_URL = 'https://www.thisisgain.com/work/';

  var controller = new AbortController(); // one signal removes every listener on destroy
  var on = function (el, type, fn) { el.addEventListener(type, fn, { signal: controller.signal }); };

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

  // Lowercase + collapse whitespace, so "Our  Sectors\n" === "our sectors".
  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // First element matching `selector` whose text is exactly `text` (normalised).
  function findByText(selector, text) {
    return Array.prototype.find.call(document.querySelectorAll(selector), function (n) {
      return norm(n.textContent) === norm(text);
    }) || null;
  }

  function closestOf(node, selector) { return node ? node.closest(selector) : null; }

  // Walk up to the ancestor that is a direct child of <main> (one page "section").
  function topLevelBlock(node) {
    var main = node.closest('main');
    while (node && node.parentElement && node.parentElement !== main) node = node.parentElement;
    return main ? node : null;
  }

  // Cards in the first `.content-slider` that comes after the heading labelled `label`.
  function cardsAfterHeading(label) {
    var heading = findByText('main h2', label);
    if (!heading) return null;
    var slider = Array.prototype.find.call(document.querySelectorAll('.content-slider'), function (s) {
      return heading.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    var cards = slider && slider.querySelectorAll('.content-card');
    return cards && cards.length ? cards : null;
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

  // Cloudflare email obfuscation: first byte is the XOR key for the rest.
  function decodeCfEmail(hex) {
    var key = parseInt(hex.substr(0, 2), 16), out = '';
    for (var i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
    return out;
  }

  // Card tags and the sector list don't always agree ("Tech & Telcoms" vs "Tech & Telco"),
  // so map a tag onto the sector whose name it equals or starts with.
  function canonicalLabel(raw, labels) {
    var n = norm(raw);
    return labels.find(function (l) { var m = norm(l); return n === m || n.indexOf(m) === 0 || m.indexOf(n) === 0; }) || raw.trim();
  }

  function textOf(root, selector) {
    var n = root.querySelector(selector);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // Slider libraries clone slides for looping; keep the first card per URL.
  function uniqueCards(cards) {
    var seen = {};
    return Array.prototype.filter.call(cards || [], function (c) {
      var a = c.querySelector('.content-card__link');
      var key = a ? a.href : '';
      if (!key || seen[key]) return false;
      return (seen[key] = true);
    });
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  /* ---------------------------------------------------------------- scraping */

  /** @returns {{name: string, description: string, url: string}[]} */
  function getServices() {
    return Array.prototype.map.call(FIND.solutionsLinks() || [], function (a) {
      return {
        name: textOf(a, '.site-navigation__submenu-link-title'),
        description: textOf(a, '.site-navigation__submenu-link-description'),
        url: a.href
      };
    });
  }

  /** @returns {string[]} */
  function getIndustries() {
    return Array.prototype.map.call(FIND.sectorLinks() || [], function (a) {
      return a.textContent.replace(/\s+/g, ' ').trim();
    });
  }

  /**
   * Work cards carry two tags: [service, industry].
   * @returns {{title: string, url: string, image: string, service: string, industry: string}[]} in slider order
   */
  function getCaseStudies(industries) {
    return uniqueCards(FIND.workCards()).map(function (card) {
      var tags = Array.prototype.map.call(card.querySelectorAll('.content-tags li'), function (li) { return li.textContent.trim(); });
      return {
        title: textOf(card, '.content-card__title'),
        url: card.querySelector('.content-card__link').href,
        image: imageUrl(card.querySelector('img')),
        service: tags[0] || '',
        industry: tags[1] ? canonicalLabel(tags[1], industries) : ''
      };
    });
  }

  /**
   * The Insights slider is ordered newest first (cards have no dates), so slider order = latest.
   * @returns {{title: string, url: string, image: string}[]}
   */
  function getArticles() {
    return uniqueCards(FIND.insightCards()).map(function (card) {
      return {
        title: textOf(card, '.content-card__title'),
        url: card.querySelector('.content-card__link').href,
        image: imageUrl(card.querySelector('img'))
      };
    });
  }

  /** @returns {string} */
  function getEmail() {
    var node = FIND.footerEmail();
    if (!node) return '';
    if (/^mailto:/i.test(node.getAttribute('href') || '')) return node.getAttribute('href').replace(/^mailto:/i, '').split('?')[0];
    var hex = node.getAttribute('data-cfemail') || (node.getAttribute('href') || '').split('#')[1];
    return hex ? decodeCfEmail(hex) : '';
  }

  /* ---------------------------------------------------------------- state */

  var data = null; // filled by scrape() on init
  var state = {
    step: 0, // 0..3 questions, 4 results
    answers: { services: [], industries: [], useful: null, timing: null }
  };

  var STEPS = [
    { key: 'services', label: 'Services', multi: true, title: 'What do you need help with?' },
    { key: 'industries', label: 'Industry', multi: true, title: 'Which industry are you in?' },
    { key: 'useful', label: 'Goal', multi: false, title: 'What would be most useful right now?' },
    { key: 'timing', label: 'Timing', multi: false, title: 'When are you looking to start?' },
    { key: 'results', label: 'Results' }
  ];

  function optionsFor(stepKey) {
    switch (stepKey) {
      case 'services': return data.services.map(function (s) { return { value: s.name, label: s.name }; });
      case 'industries': return data.industries.map(function (i) { return { value: i, label: i }; });
      case 'useful': return Object.keys(USEFUL).map(function (k) { return { value: k, label: USEFUL[k] }; });
      case 'timing': return Object.keys(TIMING).map(function (k) { return { value: k, label: TIMING[k] }; });
      default: return [];
    }
  }

  function isStepAnswered(i) {
    var v = state.answers[STEPS[i].key];
    return Array.isArray(v) ? v.length > 0 : v != null;
  }

  /* ---------------------------------------------------------------- results logic (pure) */

  /**
   * Decides what the results step shows. Pure function of answers + scraped data,
   * so going back and changing an answer just recomputes it.
   */
  function computeResults(answers, d) {
    var result = {
      heading: HEADINGS[answers.timing],
      emailTop: answers.timing === 'now' || answers.useful === 'talk', // shown once either way
      caseStudies: null, // [{item, exact}] or [] for the "none" message
      articles: null
    };

    if (answers.useful === 'cases') {
      var bySvc = function (c) { return answers.services.indexOf(c.service) > -1; };
      var byInd = function (c) { return answers.industries.indexOf(c.industry) > -1; };
      var exact = d.caseStudies.filter(function (c) { return bySvc(c) && byInd(c); });
      var related = d.caseStudies.filter(function (c) { return bySvc(c) && !byInd(c); });
      result.caseStudies = exact.map(function (c) { return { item: c, exact: true }; })
        .concat(related.map(function (c) { return { item: c, exact: false }; }))
        .slice(0, 3);
    }

    if (answers.useful === 'articles' || (answers.useful === 'talk' && answers.timing === 'exploring')) {
      result.articles = d.articles.slice(0, 3);
    }

    return result;
  }

  /* ---------------------------------------------------------------- rendering */

  var root = { section: null, modal: null };

  function buildSection(hero) {
    var section = el('section', { class: NS + '-section', 'data-gain': NS }, [
      el('div', { class: NS + '-section__inner' }, [
        el('h2', { class: NS + '-section__title', text: 'Not sure where to start?' }), // TODO copy
        el('p', { class: NS + '-section__text', text: 'Answer four quick questions and we’ll point you in the right direction.' }),
        el('button', { class: NS + '-btn', type: 'button', text: 'Start' })
      ])
    ]);
    hero.insertAdjacentElement('afterend', section);
    on(section.querySelector('.' + NS + '-btn'), 'click', openModal);
    return section;
  }

  function buildModal() {
    // TODO: dialog markup — overlay, close button, progress bar, step body, back/next footer.
    // Use role="dialog" aria-modal="true", trap focus, close on Esc/overlay click.
    var modal = el('div', { id: NS + '-modal', class: NS + '-modal', 'data-gain': NS, role: 'dialog', 'aria-modal': 'true', hidden: '' });
    document.body.appendChild(modal);
    return modal;
  }

  function renderProgress() {
    // TODO: one item per STEPS entry.
    // i < state.step  -> .is-complete (blue + green check)
    // i === state.step -> .is-active (blue, bold label)
    // i > state.step  -> .is-next (white)
    var children = STEPS.map(function (step, i) {
      var item = el('div', { class: NS + '-progress__item' }, [
        el('div', { class: NS + '-progress__item__label', text: step.label }),
        el('div', { class: NS + '-progress__item__connector' })
      ]);
      if (i < state.step) {
        item.classList.add(NS + '-progress__item--complete');
      } else if (i === state.step) {
        item.classList.add(NS + '-progress__item--active');
      } else {
        item.classList.add(NS + '-progress__item--next');
      }

      return item;
    });
    var progress = el('div', { class: NS + '-progress' }, children);
    root.modal.appendChild(progress);
    return progress;
  }

  function renderQuestion() {
    // TODO: render optionsFor(STEPS[state.step].key) as checkboxes (multi) or radios (single),
    // bind changes into state.answers, and toggle the Next button with isStepAnswered().
    var question = el('div', { class: NS + '-question' }, [
      el('h3', { class: NS + '-question__title', text: STEPS[state.step].title }),
      el('div', { class: NS + '-question__options' }, optionsFor(STEPS[state.step].key).map(function (option) {
        return el('label', { class: NS + '-question__option' }, [
          el('input', { type: 'checkbox', name: STEPS[state.step].key, value: option.value }),
          el('span', { class: NS + '-question__option__label', text: option.label })
        ]);
      }))
    ]);
    root.modal.appendChild(question);
    return question;
  }

  function renderResults() {
    var r = computeResults(state.answers, data);
    // TODO: heading, email block (if r.emailTop or useful === 'talk'),
    // case study cards with "Exact match"/"Related" labels or the "none" message + WORK_URL,
    // article cards, and a summary of answers.services / answers.industries with
    // "Change" links that call goTo(0) / goTo(1).
    var results = el('div', { class: NS + '-results' }, [
      el('h3', { class: NS + '-results__title', text: r.heading }),
      el('div', { class: NS + '-results__email' }, [
        el('p', { class: NS + '-results__email__text', text: r.emailTop ? 'We’ll send you an email with your results.' : 'We’ll send you an email with your results and a link to the case studies.' }),
        el('a', { class: NS + '-results__email__link', href: 'mailto:' + data.email, text: data.email })
      ]),
      el('div', { class: NS + '-results__case-studies' }, r.caseStudies.map(function (c) {
        return el('div', { class: NS + '-results__case-study' }, [
          el('h4', { class: NS + '-results__case-study__title', text: c.item.title }),
          el('p', { class: NS + '-results__case-study__description', text: c.item.description }),
          el('a', { class: NS + '-results__case-study__link', href: c.item.url, text: 'View case study' })
        ]);
      })),
      el('div', { class: NS + '-results__articles' }, r.articles.map(function (a) {
        return el('div', { class: NS + '-results__article' }, [
          el('h4', { class: NS + '-results__article__title', text: a.title }),
          el('p', { class: NS + '-results__article__description', text: a.description }),
          el('a', { class: NS + '-results__article__link', href: a.url, text: 'View article' })
        ]);
      })),
      el('div', { class: NS + '-results__summary' }, [
        el('h4', { class: NS + '-results__summary__title', text: 'Summary of answers' }),
        el('ul', { class: NS + '-results__summary__list' }, state.answers.services.map(function (s) {
          return el('li', { class: NS + '-results__summary__item' }, [
            el('span', { class: NS + '-results__summary__item__label', text: s }),
            el('a', { class: NS + '-results__summary__item__link', href: 'javascript:void(0)', text: 'Change' })
          ]);
        })),
        el('ul', { class: NS + '-results__summary__list' }, state.answers.industries.map(function (i) {
          return el('li', { class: NS + '-results__summary__item' }, [
            el('span', { class: NS + '-results__summary__item__label', text: i }),
            el('a', { class: NS + '-results__summary__item__link', href: 'javascript:void(0)', text: 'Change' })
          ]);
        }))
      ])
    ]);
    root.modal.appendChild(results);
    return results;
  }

  function render() {
    renderProgress();
    if (state.step < 4) renderQuestion();
    else renderResults();
  }

  function goTo(step) {
    // Can't move forward past an unanswered step.
    for (var i = 0; i < step; i++) if (!isStepAnswered(i)) return;
    state.step = step;
    render();
  }

  function openModal() {
    root.modal.hidden = false;
    document.documentElement.classList.add(NS + '-lock');
    render();
  }

  function closeModal() {
    root.modal.hidden = true;
    document.documentElement.classList.remove(NS + '-lock');
  }

  /* ---------------------------------------------------------------- lifecycle */

  function scrape() {
    var industries = getIndustries();
    return {
      services: getServices(),
      industries: industries,
      caseStudies: getCaseStudies(industries),
      articles: getArticles(),
      email: getEmail()
    };
  }

  // Everything the questionnaire needs, or null while any part is still missing.
  function pageReady() {
    var hero = FIND.hero();
    var ready = hero && FIND.solutionsLinks() && FIND.sectorLinks() &&
      FIND.workCards() && FIND.insightCards() && FIND.footerEmail();
    return ready ? hero : null;
  }

  function destroy() {
    controller.abort();
    document.querySelectorAll('[data-gain="' + NS + '"]').forEach(function (n) { n.remove(); });
    document.documentElement.classList.remove(NS + '-lock');
    delete window[INSTANCE_KEY];
  }

  // Exposed for debugging in the console, e.g. __gainQuestionnaire.data
  window[INSTANCE_KEY] = {
    destroy: destroy,
    state: state,
    computeResults: computeResults,
    get data() { return data; }
  };

  waitFor(pageReady)
    .then(function (hero) {
      if (controller.signal.aborted) return; // destroyed while waiting
      data = scrape();
      root.section = buildSection(hero);
      root.modal = buildModal();
      on(document, 'keydown', function (e) { if (e.key === 'Escape' && !root.modal.hidden) closeModal(); });
    })
    .catch(function (err) { console.warn('[' + NS + ']', err); });
})();
