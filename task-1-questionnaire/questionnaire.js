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

  // TODO: fill these in after inspecting the live homepage.
  var SELECTORS = {
    hero: '', //                 first section with the main heading
    solutionsMenuItems: '', //   links inside the "Solutions" nav menu (name + description)
    sectorItems: '', //          industries in the "Our Sectors" section
    workSlides: '', //           case study slides in the "Work" slider
    insightsSlides: '', //       article slides in the "Insights" slider
    footerEmail: '' //           mailto link in the footer
  };

  // Questions 3 & 4 are defined by the brief, so they are not scraped.
  var USEFUL = { cases: 'Case studies like mine', articles: 'Articles to read', talk: 'Talk to someone' };
  var TIMING = { now: 'Right away', soon: 'In the next 3 months', exploring: 'Just exploring' };
  var HEADINGS = { now: 'Let’s talk this week', soon: 'Here’s where to start', exploring: 'Take your time' };
  var WORK_URL = 'https://www.thisisgain.com/work/';

  var controller = new AbortController(); // one signal removes every listener on destroy
  var on = function (el, type, fn) { el.addEventListener(type, fn, { signal: controller.signal }); };

  /* ---------------------------------------------------------------- helpers */

  // Resolves once `selector` exists. Works at document-start (observes <html>).
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

  /** @returns {{name: string, description: string}[]} */
  function getServices() {
    // TODO: read from SELECTORS.solutionsMenuItems
    return [];
  }

  /** @returns {string[]} */
  function getIndustries() {
    // TODO: read from SELECTORS.sectorItems
    return [];
  }

  /** @returns {{title: string, url: string, image: string, service: string, industry: string}[]} in slider order */
  function getCaseStudies() {
    // TODO: read from SELECTORS.workSlides (watch out for cloned slides from the slider lib)
    return [];
  }

  /** @returns {{title: string, url: string, image: string, date?: string}[]} latest first */
  function getArticles() {
    // TODO: read from SELECTORS.insightsSlides
    return [];
  }

  /** @returns {string} */
  function getEmail() {
    // TODO: read from SELECTORS.footerEmail
    return '';
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
    var modal = el('div', { class: NS + '-modal', 'data-gain': NS, role: 'dialog', 'aria-modal': 'true', hidden: '' });
    document.body.appendChild(modal);
    return modal;
  }

  function renderProgress() {
    // TODO: one item per STEPS entry.
    // i < state.step  -> .is-complete (blue + green check)
    // i === state.step -> .is-active (blue, bold label)
    // i > state.step  -> .is-next (white)
  }

  function renderQuestion() {
    // TODO: render optionsFor(STEPS[state.step].key) as checkboxes (multi) or radios (single),
    // bind changes into state.answers, and toggle the Next button with isStepAnswered().
  }

  function renderResults() {
    var r = computeResults(state.answers, data);
    // TODO: heading, email block (if r.emailTop or useful === 'talk'),
    // case study cards with "Exact match"/"Related" labels or the "none" message + WORK_URL,
    // article cards, and a summary of answers.services / answers.industries with
    // "Change" links that call goTo(0) / goTo(1).
    void r;
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
    return {
      services: getServices(),
      industries: getIndustries(),
      caseStudies: getCaseStudies(),
      articles: getArticles(),
      email: getEmail()
    };
  }

  function destroy() {
    controller.abort();
    document.querySelectorAll('[data-gain="' + NS + '"]').forEach(function (n) { n.remove(); });
    document.documentElement.classList.remove(NS + '-lock');
    delete window[INSTANCE_KEY];
  }

  window[INSTANCE_KEY] = { destroy: destroy, state: state, computeResults: computeResults };

  // TODO: also wait for the sliders/footer if they render late.
  waitFor(SELECTORS.hero || 'body > *')
    .then(function (hero) {
      if (controller.signal.aborted) return; // destroyed while waiting
      data = scrape();
      root.section = buildSection(hero);
      root.modal = buildModal();
      on(document, 'keydown', function (e) { if (e.key === 'Escape' && !root.modal.hidden) closeModal(); });
    })
    .catch(function (err) { console.warn('[' + NS + ']', err); });
})();
