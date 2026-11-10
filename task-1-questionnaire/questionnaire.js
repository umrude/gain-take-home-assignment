/**
 * Task 1 — Dynamic Modal (Questionnaire)
 * Page: https://www.thisisgain.com/
 * Paste this whole file into the DevTools console. CSS: questionnaire.css
 *
 * How it fits together:
 *   1. waitFor(pageReady) — wait until everything we read from the page exists
 *      (works even when injected at document-start, before the page has parsed).
 *   2. scrape() — read services, sectors, case studies, articles and the email
 *      from the live DOM once, into `data`. Nothing is hardcoded or fetched.
 *   3. buildSection() / buildModal() — create our DOM once.
 *   4. render() — redraw the progress bar, the current step and the footer from
 *      `state`. Every interaction updates `state` then calls render()/goTo(), so
 *      `state` is the single source of truth and the DOM is just a view of it.
 *
 * The whole file is an IIFE so nothing leaks into the page's global scope except
 * the one debug handle, window.__gainQuestionnaire.
 */
(function () {
  'use strict';

  var NS = 'gq'; // class/id prefix for everything this script creates
  var INSTANCE_KEY = '__gainQuestionnaire';

  /*
   * Re-run safety (A/B scripts often run more than once): if a previous copy of this
   * script is on the page, tear it down first, then build again from scratch. destroy()
   * removes our elements, listeners and observers, so running twice == running once.
   */
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
    workCards: function () {
      return cardsAfterHeading('Work');
    },
    insightCards: function () {
      return cardsAfterHeading('Insights');
    },
    // Footer email. Cloudflare obfuscates it (`[email protected]`) until its own script runs.
    footerEmail: function () {
      return document.querySelector(
        'footer a[href^="mailto:"], footer [data-cfemail], footer a[href*="/email-protection#"]'
      );
    }
  };

  // Questions 3 & 4 are defined by the brief, so they are not scraped.
  var USEFUL = { cases: 'Case studies like mine', articles: 'Articles to read', talk: 'Talk to someone' };
  var TIMING = { now: 'Right away', soon: 'In the next 3 months', exploring: 'Just exploring' };
  var HEADINGS = { now: 'Let’s talk this week', soon: 'Here’s where to start', exploring: 'Take your time' };
  var WORK_URL = 'https://www.thisisgain.com/work/';

  /*
   * Every listener goes through on(), which registers it with one AbortController.
   * destroy() calls controller.abort() and the browser removes all of them at once,
   * so we never need to keep references to handlers just to remove them later.
   * This matters most for listeners on `document` (Esc), which outlive our elements.
   */
  var controller = new AbortController();
  var on = function (el, type, fn) {
    el.addEventListener(type, fn, { signal: controller.signal });
  };

  /* ---------------------------------------------------------------- helpers */

  /**
   * Resolves with the first truthy result of `finder` (a function, or a CSS selector).
   *
   * Why it works at document-start: <body> may not exist yet, but <html> always does,
   * so we observe <html> for added nodes. The page fires thousands of mutations while
   * parsing, so instead of re-checking on each one we queue at most one check per
   * animation frame (`queued` flag + requestAnimationFrame).
   * It also cleans up after itself on timeout and if the instance is destroyed mid-wait.
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

  // Lowercase + collapse whitespace, so "Our  Sectors\n" === "our sectors".
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

  // node.closest() that tolerates a null node, so FIND chains don't need `if`s.
  function closestOf(node, selector) {
    return node ? node.closest(selector) : null;
  }

  // Walk up to the ancestor that is a direct child of <main> (one page "section").
  function topLevelBlock(node) {
    var main = node.closest('main');
    while (node && node.parentElement && node.parentElement !== main) node = node.parentElement;
    return main ? node : null;
  }

  /*
   * Cards in the first `.content-slider` that comes after the heading labelled `label`.
   * The heading and the slider aren't parent/child, so we can't use closest(). Instead,
   * compareDocumentPosition() returns a bitmask; `& DOCUMENT_POSITION_FOLLOWING` is
   * truthy when the slider comes later in the document than the heading.
   */
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
    } catch (e) {
      return '';
    }
  }

  /*
   * Cloudflare email obfuscation. The footer HTML contains "[email protected]" plus a
   * hex string (data-cfemail); Cloudflare's own script decodes it later. We decode it
   * ourselves so it works at document-start: the first byte is an XOR key, and every
   * following byte XOR the key is one character of the address.
   */
  function decodeCfEmail(hex) {
    var key = parseInt(hex.substr(0, 2), 16),
      out = '';
    for (var i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
    return out;
  }

  // Card tags and the sector list don't always agree ("Tech & Telcoms" vs "Tech & Telco"),
  // so map a tag onto the sector whose name it equals or starts with.
  function canonicalLabel(raw, labels) {
    var n = norm(raw);
    return (
      labels.find(function (l) {
        var m = norm(l);
        return n === m || n.indexOf(m) === 0 || m.indexOf(n) === 0;
      }) || raw.trim()
    );
  }

  // Trimmed text of the first `selector` match inside `root`, or '' if missing.
  function textOf(root, selector) {
    var n = root.querySelector(selector);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  /*
   * Slider libraries clone slides for looping; keep the first card per URL.
   * `return (seen[key] = true)` records the URL and returns true (keep) in one step.
   */
  function uniqueCards(cards) {
    var seen = {};
    return Array.prototype.filter.call(cards || [], function (c) {
      var a = c.querySelector('.content-card__link');
      var key = a ? a.href : '';
      if (!key || seen[key]) return false;
      return (seen[key] = true);
    });
  }

  /**
   * Tiny DOM builder: el('a', { class: 'x', href: '/y', text: 'Hi' }, [children]).
   * `text` sets textContent (never innerHTML, so scraped text can't inject markup).
   * Gotcha: everything else goes through setAttribute, so boolean attributes are on
   * whenever they're present — { hidden: false } still hides. For booleans that change
   * later, set the property instead (button.disabled = true, modal.hidden = false).
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
   * Question 1 options: the "Solutions" menu items (name + description).
   * @returns {{name: string, description: string, url: string}[]}
   */
  function getServices() {
    return Array.prototype.map.call(FIND.solutionsLinks() || [], function (a) {
      return {
        name: textOf(a, '.site-navigation__submenu-link-title'),
        description: textOf(a, '.site-navigation__submenu-link-description'),
        url: a.href
      };
    });
  }

  /**
   * Question 2 options: the sector links in "Our Sectors".
   * @returns {string[]}
   */
  function getIndustries() {
    return Array.prototype.map.call(FIND.sectorLinks() || [], function (a) {
      return a.textContent.replace(/\s+/g, ' ').trim();
    });
  }

  /**
   * Case studies from the "Work" slider, in slider order (the brief's tie-breaker).
   * Each card carries two tags: [service, industry]. The industry is mapped onto the
   * sector list with canonicalLabel() so it can be compared with question 2's answers.
   * @returns {{title: string, url: string, image: string, service: string, industry: string}[]}
   */
  function getCaseStudies(industries) {
    return uniqueCards(FIND.workCards()).map(function (card) {
      var tags = Array.prototype.map.call(card.querySelectorAll('.content-tags li'), function (li) {
        return li.textContent.trim();
      });
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

  /**
   * The footer email: a plain mailto: link if Cloudflare's script has already run,
   * otherwise decoded from the obfuscated data-cfemail / #hex (see decodeCfEmail).
   * @returns {string}
   */
  function getEmail() {
    var node = FIND.footerEmail();
    if (!node) return '';
    if (/^mailto:/i.test(node.getAttribute('href') || ''))
      return node
        .getAttribute('href')
        .replace(/^mailto:/i, '')
        .split('?')[0];
    var hex = node.getAttribute('data-cfemail') || (node.getAttribute('href') || '').split('#')[1];
    return hex ? decodeCfEmail(hex) : '';
  }

  /* ---------------------------------------------------------------- state */

  var data = null; // filled by scrape() on init

  /*
   * Everything the UI shows is derived from this object. Multi-answer questions hold
   * arrays, single-answer ones hold a key from USEFUL / TIMING (or null). Answers are
   * kept when the modal is closed, so reopening resumes where the user left off.
   */
  var state = {
    step: 0, // 0..3 questions, 4 results
    answers: { services: [], industries: [], useful: null, timing: null }
  };

  /*
   * One entry per step, in order. `key` is where the answer lives in state.answers,
   * `multi` decides checkbox vs radio, `label` is the progress-bar text.
   * Adding/reordering a question only needs a change here (+ optionsFor).
   */
  var STEPS = [
    { key: 'services', label: 'Services', multi: true, title: 'What do you need help with?' },
    { key: 'industries', label: 'Industry', multi: true, title: 'Which industry are you in?' },
    { key: 'useful', label: 'Goal', multi: false, title: 'What would be most useful right now?' },
    { key: 'timing', label: 'Timing', multi: false, title: 'When are you looking to start?' },
    { key: 'results', label: 'Results' }
  ];

  /*
   * The options for a step as { value, label } pairs. Questions 1–2 come from the
   * scraped `data`; questions 3–4 are fixed by the brief. For 3–4 the stored value is
   * the short key ('now', 'talk'...), not the label, so the results logic never
   * depends on display text.
   */
  function optionsFor(stepKey) {
    switch (stepKey) {
      case 'services':
        return data.services.map(function (s) {
          return { value: s.name, label: s.name };
        });
      case 'industries':
        return data.industries.map(function (i) {
          return { value: i, label: i };
        });
      case 'useful':
        return Object.keys(USEFUL).map(function (k) {
          return { value: k, label: USEFUL[k] };
        });
      case 'timing':
        return Object.keys(TIMING).map(function (k) {
          return { value: k, label: TIMING[k] };
        });
      default:
        return [];
    }
  }

  // Arrays need at least one pick; single answers need a value. Drives Next + goTo().
  function isStepAnswered(i) {
    var v = state.answers[STEPS[i].key];
    return Array.isArray(v) ? v.length > 0 : v != null;
  }

  /* ---------------------------------------------------------------- results logic (pure) */

  /**
   * Decides what the results step shows. Pure function of answers + scraped data
   * (no DOM), so going back and changing an answer just recomputes it, and it can be
   * tested from the console: __gainQuestionnaire.computeResults({...}, __gainQuestionnaire.data)
   *
   * Brief rules → code:
   * - Heading comes from question 4 (HEADINGS[timing]).
   * - emailTop: "Right away" OR "Talk to someone". One flag covers both, which is how
   *   the email is shown only once when both apply.
   * - Case studies: exact = picked service AND picked industry; related = picked service
   *   only. Exact first, then related, max 3. filter() keeps slider order inside each group.
   *   null = not asked for; [] = asked for but none match (→ "none" message).
   * - Articles: "Articles to read", or "Talk to someone" + "Just exploring".
   */
  function computeResults(answers, d) {
    var result = {
      heading: HEADINGS[answers.timing],
      emailTop: answers.timing === 'now' || answers.useful === 'talk', // shown once either way
      caseStudies: null, // [{item, exact}] or [] for the "none" message
      articles: null
    };

    if (answers.useful === 'cases') {
      var bySvc = function (c) {
        return answers.services.indexOf(c.service) > -1;
      };
      var byInd = function (c) {
        return answers.industries.indexOf(c.industry) > -1;
      };
      var exact = d.caseStudies.filter(function (c) {
        return bySvc(c) && byInd(c);
      });
      var related = d.caseStudies.filter(function (c) {
        return bySvc(c) && !byInd(c);
      });
      result.caseStudies = exact
        .map(function (c) {
          return { item: c, exact: true };
        })
        .concat(
          related.map(function (c) {
            return { item: c, exact: false };
          })
        )
        .slice(0, 3);
    }

    if (answers.useful === 'articles' || (answers.useful === 'talk' && answers.timing === 'exploring')) {
      result.articles = d.articles.slice(0, 3);
    }

    return result;
  }

  /* ---------------------------------------------------------------- rendering */

  // References to our long-lived elements, so render() doesn't have to search for them.
  var root = { section: null, modal: null, modalContent: null, backBtn: null, nextBtn: null };

  /*
   * The new section under the hero. `data-gain="gq"` marks every root element we add,
   * which is how destroy() finds and removes them on a re-run.
   */
  function buildSection(hero) {
    var section = el('section', { class: NS + '-section', 'data-gain': NS }, [
      el('div', { class: NS + '-section__inner' }, [
        el('h2', { class: NS + '-section__title', text: 'Not sure where to start?' }),
        el('p', {
          class: NS + '-section__text',
          text: 'Answer four quick questions and we’ll point you in the right direction.'
        }),
        el('button', { class: NS + '-btn', type: 'button', text: 'Start' })
      ])
    ]);
    hero.insertAdjacentElement('afterend', section);
    on(section.querySelector('.' + NS + '-btn'), 'click', openModal);
    return section;
  }

  /*
   * Builds the modal's fixed structure ONCE. render() only swaps the contents of
   * the progress wrapper and the content area; the shell, buttons and their listeners
   * stay the same for the life of the instance.
   *
   *   .gq-modal                    overlay (click outside the panel to close)
   *     .gq-modal__content-wrapper the white panel, role="dialog"
   *       progress-wrapper | close | content | footer (Back, Next)
   */
  function buildModal() {
    var closeBtn = el('button', { class: NS + '-modal__close', type: 'button', text: 'Close' });
    var backBtn = el('button', { class: NS + '-modal__footer__button', type: 'button', text: 'Back' });
    var nextBtn = el('button', { class: NS + '-modal__footer__button', type: 'button', text: 'Next' });
    var modalContent = el('div', { class: NS + '-modal__content' });

    /*
     * `data-lenis-prevent`: the site smooth-scrolls with Lenis, which turns wheel events
     * into window.scrollTo() calls, and overflow: hidden doesn't stop scrolling from code.
     * Lenis ignores events from inside elements with this attribute, and the overlay
     * covers the whole viewport, so while the modal is open Lenis leaves scrolling to the
     * browser: the page stays locked (gq-lock) and the modal content scrolls natively.
     */
    var modal = el(
      'div',
      {
        id: NS + '-modal',
        class: NS + '-modal',
        'data-gain': NS,
        'data-lenis-prevent': '',
        hidden: ''
      },
      [
        el('div', { class: NS + '-modal__content-wrapper', role: 'dialog', 'aria-modal': 'true' }, [
          el('div', { class: NS + '-modal__progress-wrapper' }),
          closeBtn,
          modalContent,
          el('div', { class: NS + '-modal__footer' }, [backBtn, nextBtn])
        ])
      ]
    );
    on(backBtn, 'click', function () {
      goTo(state.step - 1);
    });
    on(nextBtn, 'click', function () {
      goTo(state.step + 1);
    });
    on(closeBtn, 'click', closeModal);

    // Clicks inside the panel bubble up to the overlay too; e.target is only the
    // overlay itself when the click landed outside the panel.
    on(modal, 'click', function (e) {
      if (e.target === modal) closeModal();
    });
    root.backBtn = backBtn;
    root.nextBtn = nextBtn;
    root.modalContent = modalContent;
    document.body.appendChild(modal);
    return modal;
  }

  /*
   * Progress bar (Figure 2): one item per STEPS entry, state decided by position:
   *   before the current step → --complete (blue + green check)
   *   the current step        → --active   (blue, bold label)
   *   after it                → --next     (white)
   * The numbered circle, connector line and check badge are all drawn in CSS
   * (::before / ::after), so the markup stays a label + a connector.
   */
  function renderProgress() {
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
    if (root.modal.querySelector('.' + NS + '-modal__progress-wrapper')) {
      root.modal.querySelector('.' + NS + '-modal__progress-wrapper').replaceChildren(progress);
    }
    return progress;
  }

  /*
   * Renders the current question. Checkboxes for multi-answer steps, radios (shared
   * `name`, so the browser enforces one choice) for single-answer steps. Inputs start
   * checked from state.answers, which is what keeps earlier picks when going back.
   */
  function renderQuestion() {
    var step = STEPS[state.step];
    var question = el('div', { class: NS + '-question' }, [
      el('h3', { class: NS + '-question__title', text: step.title }),
      el(
        'div',
        { class: NS + '-question__options' },
        optionsFor(step.key).map(function (option) {
          var inputAttr = {
            type: step.multi ? 'checkbox' : 'radio',
            name: step.key,
            value: option.value
          };

          if (step.multi && state.answers[step.key].includes(option.value)) {
            inputAttr.checked = true;
          } else if (!step.multi && state.answers[step.key] === option.value) {
            inputAttr.checked = true;
          }
          return el('label', { class: NS + '-question__option' }, [
            el('input', inputAttr),
            el('span', { class: NS + '-question__option__label', text: option.label })
          ]);
        })
      )
    ]);

    /*
     * Event delegation: one `change` listener on the question container handles every
     * input, because change events bubble. The container is replaced on the next
     * render, so the old listener goes with it.
     * Multi: add or remove the value depending on whether the box is now ticked.
     * Single: a radio only fires `change` when it becomes selected, so just store it.
     * (The two branches matter: single answers start as null, which has no .concat.)
     */
    on(question, 'change', function (e) {
      var selectedValue = e.target.value;
      if (step.multi) {
        state.answers[step.key] = e.target.checked
          ? state.answers[step.key].concat(selectedValue)
          : state.answers[step.key].filter(function (v) {
              return v !== selectedValue;
            });
      } else {
        state.answers[step.key] = selectedValue;
      }
      updateFooter();
    });

    root.modalContent.replaceChildren(question);
    return question;
  }

  /*
   * Results step. computeResults() decides WHAT to show; this only turns it into DOM.
   * Each block is either an element or null (el() skips null children), so a block
   * that doesn't apply to this combination simply isn't built.
   *
   * Order on screen = order in the brief:
   *   heading (Q4) → email (Right away / Talk to someone, shown once)
   *   → case studies or the "none" message → articles → summary of Q1 + Q2
   * "Talk to someone" + "Just exploring" therefore shows the articles under the email.
   */
  function renderResults() {
    var r = computeResults(state.answers, data);

    var results = el('div', { class: NS + '-results' }, [
      el('h3', { class: NS + '-results__title', text: r.heading }),

      r.emailTop
        ? el('div', { class: NS + '-results__email' }, [
            el('p', { class: NS + '-results__email__text', text: 'Ready to talk? Email us at' }),
            el('a', { class: NS + '-results__email__link', href: 'mailto:' + data.email, text: data.email })
          ])
        : null,

      // null = case studies weren't asked for; [] = asked for, but nothing matched.
      r.caseStudies && r.caseStudies.length
        ? el('div', { class: NS + '-results__case-studies' }, r.caseStudies.map(caseStudyCard))
        : null,
      r.caseStudies && !r.caseStudies.length
        ? el('p', { class: NS + '-results__empty' }, [
            document.createTextNode('No case studies match your picks yet. '),
            el('a', { href: WORK_URL, text: 'See all our work' })
          ])
        : null,

      r.articles ? el('div', { class: NS + '-results__articles' }, r.articles.map(articleCard)) : null,

      el('div', { class: NS + '-results__summary' }, [
        el('h4', { class: NS + '-results__summary__title', text: 'Your answers' }),
        summaryRow('Services', state.answers.services, 0),
        summaryRow('Industries', state.answers.industries, 1)
      ])
    ]);

    /*
     * One delegated listener for both "Change" buttons. closest() rather than
     * e.target.matches() so a click on any part of the button still counts.
     * dataset values are always strings; without Number(), Next would later compute
     * "0" + 1 === "01", and STEPS["01"] is undefined.
     */
    on(results, 'click', function (e) {
      var change = e.target.closest('[data-step]');
      if (change) goTo(Number(change.dataset.step));
    });

    root.modalContent.replaceChildren(results);
    return results;
  }

  // Case study card: image, Exact match / Related badge, title, link to the real page.
  function caseStudyCard(c) {
    return el('div', { class: NS + '-results__case-study' }, [
      el('img', { class: NS + '-results__case-study__image', src: c.item.image, alt: '', loading: 'lazy' }),
      el('span', {
        class: NS + '-badge ' + NS + (c.exact ? '-badge--exact' : '-badge--related'),
        text: c.exact ? 'Exact match' : 'Related'
      }),
      el('h4', { class: NS + '-results__case-study__title', text: c.item.title }),
      el('a', { class: NS + '-results__case-study__link', href: c.item.url, text: 'View case study' })
    ]);
  }

  // Article card: image, title, link to the real page.
  function articleCard(a) {
    return el('div', { class: NS + '-results__article' }, [
      el('img', { class: NS + '-results__article__image', src: a.image, alt: '', loading: 'lazy' }),
      el('h4', { class: NS + '-results__article__title', text: a.title }),
      el('a', { class: NS + '-results__article__link', href: a.url, text: 'View article' })
    ]);
  }

  // One summary row per question: label, the picks as chips, and a Change button
  // that jumps back to that question (data-step = its index in STEPS).
  function summaryRow(label, values, stepIndex) {
    return el('div', { class: NS + '-results__summary__row' }, [
      el('span', { class: NS + '-results__summary__label', text: label }),
      el(
        'ul',
        { class: NS + '-results__summary__list' },
        values.map(function (v) {
          return el('li', { class: NS + '-results__summary__item', text: v });
        })
      ),
      el('button', {
        class: NS + '-results__summary__change',
        type: 'button',
        text: 'Change',
        'aria-label': 'Change ' + label.toLowerCase(),
        'data-step': stepIndex
      })
    ]);
  }

  /*
   * Footer state for the current step: no Back on question 1, no Next on the results,
   * and Next disabled until the step is answered. Runs on every render and on every
   * answer change, so it can never go stale.
   */
  function updateFooter() {
    root.backBtn.classList.toggle('hidden', state.step === 0);
    root.nextBtn.classList.toggle('hidden', state.step === STEPS.length - 1);
    root.nextBtn.disabled = !isStepAnswered(state.step);
  }

  // Redraws everything that depends on `state`. Called on open and on every step change.
  function render() {
    renderProgress();
    if (state.step < 4) renderQuestion();
    else renderResults();

    root.modalContent.scrollTop = 0;
    updateFooter();
  }

  /*
   * The only way to change step. Moving forward requires every earlier step to be
   * answered, so Next can't skip a question even if its `disabled` is removed in
   * DevTools. Going back always passes (fewer steps to check).
   */
  function goTo(step) {
    for (var i = 0; i < step; i++) if (!isStepAnswered(i)) return;
    state.step = step;
    render();
  }

  /*
   * `gq-lock` (overflow: hidden on <html>) stops native scrolling of the page behind the
   * modal; `data-lenis-prevent` on the overlay stops Lenis's JS scrolling (see buildModal).
   * Both are needed on this site.
   */
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

  // Reads everything from the page once. Industries first: case studies map onto them.
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
    var ready =
      hero &&
      FIND.solutionsLinks() &&
      FIND.sectorLinks() &&
      FIND.workCards() &&
      FIND.insightCards() &&
      FIND.footerEmail();
    return ready ? hero : null;
  }

  // Undo everything this instance did: listeners (abort), our elements, the scroll lock.
  function destroy() {
    controller.abort();
    document.querySelectorAll('[data-gain="' + NS + '"]').forEach(function (n) {
      n.remove();
    });
    document.documentElement.classList.remove(NS + '-lock');
    delete window[INSTANCE_KEY];
  }

  /*
   * The one global: lets the next run find and destroy this instance, and is handy in
   * the console (__gainQuestionnaire.state, .data). `data` is a getter because it's
   * only filled in once the page is ready.
   */
  window[INSTANCE_KEY] = {
    destroy: destroy,
    state: state,
    computeResults: computeResults,
    get data() {
      return data;
    }
  };

  waitFor(pageReady)
    .then(function (hero) {
      // If the script was re-run while this one was still waiting, this instance has
      // been destroyed; building now would create a duplicate section.
      if (controller.signal.aborted) return;
      data = scrape();
      root.section = buildSection(hero);
      root.modal = buildModal();
      on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && !root.modal.hidden) closeModal();
      });
    })
    .catch(function (err) {
      console.warn('[' + NS + ']', err);
    });
})();
