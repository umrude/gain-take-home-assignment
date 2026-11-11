// ==UserScript==
// @name         GAIN take-home (local dev)
// @namespace    gain-take-home
// @version      0.1.0
// @description  Injects the task CSS + JS from the local repo at document-start, like an A/B testing tool would.
// @match        https://www.thisisgain.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getResourceText
// @resource     task1_css  file:///G:/PersonalProjec/GAIN%20-%20Interview/task-1-questionnaire/questionnaire.css
// @resource     task1_js   file:///G:/PersonalProjec/GAIN%20-%20Interview/task-1-questionnaire/questionnaire.js
// @resource     task2_css  file:///G:/PersonalProjec/GAIN%20-%20Interview/task-2-footer-drawer/drawer.css
// @resource     task2_js   file:///G:/PersonalProjec/GAIN%20-%20Interview/task-2-footer-drawer/drawer.js
// @resource     task3_css  file:///G:/PersonalProjec/GAIN%20-%20Interview/task-3-spa-pokemon/pokemon.css
// @resource     task3_js   file:///G:/PersonalProjec/GAIN%20-%20Interview/task-3-spa-pokemon/pokemon.js
// ==/UserScript==

/*
 * Setup: see tampermonkey/README.md.
 *
 * Why inject a <script> tag instead of using @require?
 * Userscripts with @grant run in a sandbox with their own `window`. Every task stores its
 * instance on the page's `window` (so a re-run, injected or pasted, finds and destroys it),
 * so the code has to run in the page's own context, exactly like pasting it into the console.
 */
(function () {
  'use strict';

  const path = location.pathname;
  const isHome = path === '/';
  const isBlog = /^\/blog(\/|$)/.test(path); // also /blog/page/2/ etc.

  // Flip `enabled` to test a task on its own.
  const TASKS = [
    { id: 'task1', name: 'questionnaire', enabled: true, when: isHome },
    { id: 'task2', name: 'drawer', enabled: true, when: isHome },
    { id: 'task3', name: 'pokemon', enabled: true, when: isBlog }
  ];

  function read(resource) {
    try {
      return GM_getResourceText(resource) || '';
    } catch (e) {
      return '';
    }
  }

  // At document-start <head> may not exist yet; <html> always does.
  function target() {
    return document.head || document.documentElement;
  }

  function injectCss(task) {
    const css = read(task.id + '_css');
    const id = 'gain-css-' + task.name;
    const style = document.getElementById(id) || document.createElement('style');
    style.id = id;
    style.textContent = css;
    if (!style.parentNode) target().appendChild(style);
    return css.length;
  }

  function injectJs(task) {
    const js = read(task.id + '_js');
    const script = document.createElement('script');
    // sourceURL gives the code a name in DevTools > Sources, so breakpoints work.
    script.textContent = js + '\n//# sourceURL=gain-' + task.name + '.js';
    target().appendChild(script); // runs synchronously, in the page context
    script.remove();
    return js.length;
  }

  TASKS.forEach(function (task) {
    if (!task.enabled || !task.when) return;
    const cssLen = injectCss(task);
    const jsLen = injectJs(task);
    // Character counts make it easy to spot a stale cached file after an edit.
    console.info(
      '[gain-dev] ' +
        task.name +
        ' injected at ' +
        document.readyState +
        ' (css ' +
        cssLen +
        ' chars, js ' +
        jsLen +
        ' chars)'
    );
  });
})();
