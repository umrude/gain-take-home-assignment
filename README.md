# GAIN Take-Home Assignment

Three console-injected experiments for https://www.thisisgain.com/, written in plain CSS and vanilla JavaScript.

## How to run

Each task has two files:

| Task                             | JS (paste into the console)                                                    | CSS (inject into `<head>`)                                                       | Page                             |
| -------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------- |
| 1. Dynamic Modal (Questionnaire) | [task-1-questionnaire/questionnaire.js](task-1-questionnaire/questionnaire.js) | [task-1-questionnaire/questionnaire.css](task-1-questionnaire/questionnaire.css) | https://www.thisisgain.com/      |
| 2. Footer Drawer                 | [task-2-footer-drawer/drawer.js](task-2-footer-drawer/drawer.js)               | [task-2-footer-drawer/drawer.css](task-2-footer-drawer/drawer.css)               | https://www.thisisgain.com/      |
| 3. SPA DOM Manipulation          | [task-3-spa-pokemon/pokemon.js](task-3-spa-pokemon/pokemon.js)                 | [task-3-spa-pokemon/pokemon.css](task-3-spa-pokemon/pokemon.css)                 | https://www.thisisgain.com/blog/ |

1. Open the page.
2. Inject the CSS into `<head>`. The A/B tool does this in production. To do it by hand, paste this into the console with the CSS between the backticks:
   ```js
   document.head.insertAdjacentHTML('beforeend', '<style id="gain-css-task-N">' + `/* CSS here */` + '</style>');
   ```
3. Paste the JS file into the console and press Enter.

### Development setup

- **[tampermonkey/](tampermonkey/README.md):** a userscript that loads each task's CSS and JS from this repo at `document-start`, the way an A/B testing tool would. Edit a file, reload the page, and the change is live. It's also how the "runs before the page has loaded" bonus is tested.
- **[tests/](tests/):** the automated requirement tests (Playwright). See [How I tested](#how-i-tested).
- **Prettier** ([.prettierrc.json](.prettierrc.json)) formats the code on save. The config matches the code style: single quotes, semicolons, no trailing commas.

## Design notes

- **Safe to re-run:** every script stores its instance on `window` (for example `window.__gainQuestionnaire`). When it runs again, it calls the previous instance's `destroy()` first. That removes the elements it added, its listeners (through one `AbortController`) and its observers, then the script builds everything again. Running it twice gives the same result as running it once.
- **Works before the page has loaded (bonus):** `waitFor(finder)` takes a selector or a function. It uses a `MutationObserver` on `document` itself, which exists even before `<html>` does, and checks again at most once per frame, so the scripts can run at `document-start`. The script starts only once everything it reads from the page is there.
- **Standalone files:** each JS file contains the small helpers it needs, so you can paste it on its own with nothing else.
- **Finding elements without IDs:** the site's sections are generic `wp-block-group` wrappers with no IDs. Instead of selectors that would break easily, a `FIND` object at the top of each file has one small function per part of the page. Each function anchors on something stable, then searches inside it:
  - the `<h1>`, for the hero
  - the labels the brief names: "Solutions", "Our Sectors", "Work", "Insights"
  - component classes: `content-card`, `site-navigation__*`
  - the theme's `data-behaviour` hooks, on the blog

  If the site's markup changes, only `FIND` needs updating.

- **Quirks of the live site the scripts handle:**
  - The footer email is hidden by Cloudflare's email protection. The scripts decode `data-cfemail` themselves, so the email can be read before Cloudflare's script runs.
  - Images are lazy-loaded through ShortPixel. Until an image loads, its real URL is inside the placeholder SVG's `data-u` attribute.
  - Work card industry tags don't always match the "Our Sectors" names ("Tech & Telcoms" vs "Tech & Telco"). Tags are mapped to the closest sector name.
  - The Insights cards have no dates. Slider order (newest first) is used as "latest".
  - The site smooth-scrolls with Lenis, which scrolls the page from JavaScript, so `overflow: hidden` alone doesn't lock the page behind the modal. The page's Lenis instance isn't exposed (`window.lenis` only holds the version), so overlays use Lenis's own opt-out attribute, `data-lenis-prevent`. Lenis then ignores wheel and touch events from inside them.
  - The footer and some sections are lazy-rendered by WP Rocket (`content-visibility: auto` with no placeholder size), so until they render they're 0px tall. Jumping to the end of the page (End key, scrollbar) lands on a "bottom" that moves 700–1500px further down a few frames later. The drawer therefore waits 300ms after reaching the bottom, measures again, and only closes if it's still the bottom.
- **Matching GAIN's look (Tasks 1 and 2):** wherever the brief doesn't set a style, the styles use the site's own design tokens:
  - colours: not-black `#001400`, growth green `#00FF7F` and white
  - fonts: Inter Tight for headings, uppercase Anonymous Pro for labels and buttons
  - pill-shaped buttons

  The progress bar keeps the blue and green from Figure 2, because the brief asks for them, with an icon per step and blue labels (bold for the active step). Its labels use Inter Tight rather than the mono font: the site only loads Anonymous Pro at weight 700, so the active step couldn't be bolder than the others. The section is a light card rather than a dark band, so the pixel button's dark outline (a Figure 1 detail) stays visible.

  In Task 2, Figures 3–5 are layout examples rather than a colour spec. The drawer keeps their layout and the tooltip's bubble-and-arrow shape, but uses GAIN's colours: a growth-green tab like the site's "LET'S TALK" button, a white panel when open, and a not-black tooltip.

- **How the questionnaire is built:**
  - **Single source of truth:** `state` (the current step plus the answers) holds everything, and `render()` redraws the progress bar, the step and the footer from it.
  - **Moving between steps:** Back, Next and "Change" all go through `goTo()`. It refuses to move past an unanswered step, so the rule holds even if the disabled Next button is re-enabled in DevTools.
  - **Results:** `computeResults()` is a pure function of the answers and the scraped data, so it can be tested from the console without touching the DOM:
    `__gainQuestionnaire.computeResults({ services: ['Experience'], industries: ['Retail'], useful: 'cases', timing: 'now' }, __gainQuestionnaire.data)`
- **How the Pokémon blog is built (Task 3):**
  - **"Turn the Filter by Capability dropdown into Filter by type":** React's capability dropdown is hidden with CSS, and our own "Filter by type" dropdown is inserted directly after it, so it appears in exactly the same place. I didn't edit React's dropdown in place. It's React's own element (with `value` and `onChange` props), and changing it sends `POST admin-ajax.php?action=list_results` and swaps the whole article list. Picking "Fire" there would ask the server for articles with the capability "fire" and replace the cards, but the brief asks for "only the Pokémon of that type **on the current page**". Stopping that would need `stopPropagation` (see below), and React would reset its own value and options the next time it redraws. Ours is invisible to React, so the visible result is what the brief describes: where "Filter by Capability" was, there's "Filter by type" with the 18 regular types.
  - **Filtering only hides cards.** It adds a class to the `<li>`s that don't match, so nothing is rebuilt and flipped cards stay flipped. The "No Fire Pokémon on this page." message sits right after React's `<ul>`, above the page numbers, and only appears once every card has loaded, so it doesn't flash while they arrive.
  - **The chosen type** is kept in `sessionStorage` and re-applied after every redraw, so it stays selected when changing pages.
  - **Following React's updates without history hooks.** Paging, filtering and the browser's back and forward buttons all end with React replacing the cards, and React updates the URL before it does. So one `MutationObserver` on the listing is enough: by the time it fires, the page number in the URL is already the new one. I checked this, including back and forward. Wrapping `history.pushState` would patch a global that the site and its analytics also use, to learn something the cards already tell us. Our own changes trigger the observer once more, but by then every card is done, so it settles (0 changes in the 2s after).
  - **Flipped cards are remembered** while you're on the page (a `Set` of Pokémon numbers), because React throws the old cards away when paging. Coming back to a page, they're rebuilt already flipped, with no animation and no cry.
  - **Bonus: the Pokémon's cry.** Flipping a card to its back plays that Pokémon's cry from PokeAPI (`cries.latest`), at 40% volume so it doesn't startle. It only plays when you flip a card yourself: not when turning it back to the front, and not when a remembered card comes back already flipped after paging. Some Pokémon have no cry, so those just flip silently. If the browser blocks the sound or the file fails to load, `play()` rejects; that's caught, so it never shows up as an "Uncaught (in promise)" error and the flip works the same.
  - **The 18 types are a fixed list** in the games' order. PokeAPI's `/type/` endpoint also returns `stellar`, `unknown` and `shadow`, which no Pokémon has as its type, so they'd need filtering out by a hardcoded rule anyway. A fixed list also shows the dropdown straight away, even if PokeAPI is slow.
  - **Each Pokémon is fetched once** and cached on `window`, so paging back and re-running the script don't request it again. If a request fails, the card shows a visible error instead of staying hidden, and it's retried the next time that page is shown.
- **Overlays and the cookie button:** the site manages consent with Cookiebot, which has a floating button at the bottom left. Consent withdrawal must stay easy to reach (UK/EU GDPR Art. 7(3)), so the two kinds of overlay are treated differently:
  - **The questionnaire modal covers the button.** It's a temporary overlay that the user opened and can dismiss (×, Esc, or a click outside). A modal should sit above the whole page, and the button is back as soon as the modal closes. Without this, the widget sat on top of the modal's Back button on mobile.
  - **The sticky drawer (Task 2) doesn't cover it.** The drawer stays on screen all the time, so it sits below Cookiebot's widget and leaves the button reachable. On phones, where the button sits at the bottom left, the drawer leaves empty space under the cards for it, so it doesn't cover "View case study". On tablet and desktop the site floats it higher (about 130px up), where it covers the first few letters of the first card's description. That's accepted on purpose: it floats over the site's own content the same way, and GAIN's consent widget isn't ours to move or restyle. The site also has a "Cookies" link in the footer.
  - **The first-visit consent banner is never blocked.** The modal only opens when the user clicks Start.

  On a real client site, I'd check this with whoever owns the consent setup.

- **Hover styles inside the modal** are wrapped in `@media (hover: hover)`. Otherwise, on touch screens, `:hover` sticks to the last tapped button (for example, Back stays black after tapping it). The pixel button keeps its plain `:hover`, because Figure 1 requires that state.
- **The drawer's tooltip (Figure 5) when space is tight:** the slider scrolls sideways, so it cuts off anything that sticks out of it, and a bubble centred over the tag (as in Figure 5) would be clipped on the first slide. Instead:
  - The bubble is left-aligned to the tag, which always sits at the slide's left edge, and its arrow is centred on the tag.
  - Its width is capped to the slide with container query units (`100cqi`), so long text wraps inside the slide rather than overflowing. No JS measuring.
  - It opens upward over the image, which has a fixed 16:9 shape, so there's always room. A slide without an image flips it below the tag (`:has()`).
  - Touch has no hover, and Safari doesn't focus a button when it's tapped, so tapping the tag toggles the tooltip. Tapping elsewhere, Esc, scrolling the slider or closing the drawer hides it. Mouse hover and keyboard focus are CSS-only.
- **Playing nicely with the site (A/B testing).** Test code runs on someone else's live page, next to their framework and their analytics. A variant is only useful if it's measured the same way as the original, and if it doesn't break what's around it. Lessons from these three tasks:
  - **Don't swallow events.** The Pokémon cards don't call `stopPropagation`. I checked first: React has no click handlers on the cards, and the article link is hidden, so there's nothing to block. With `stopPropagation`, the site's own `document` click listeners (analytics, tag managers, "click outside" handlers) saw 0 card clicks; without it they see every one. If blocking a framework's handler were ever unavoidable, I'd scope it to our elements and push the experiment's own tracking event (e.g. to the `dataLayer`) instead of silently losing the click. I wouldn't send real events from a take-home.
  - **Prefix every class and state.** An unprefixed `is-open` on the drawer's tooltip picked up a rule from the site's CSS and turned the tooltip upside down. Everything is now `gq-`, `gd-` or `gp-`, including state modifiers.
  - **Never remove or edit the framework's own nodes.** Our Pokémon card is appended inside React's `<li>`, and React's children are only hidden with CSS. Removing them (`replaceChildren`) leaves React holding nodes that aren't in the page, and its next update can throw.
  - **Stop the flicker before the JS runs.** The CSS hides article content and React's dropdowns from the first paint, the same job A/B tools do with "anti-flicker" snippets.
  - **Re-runs and clean-up.** Tools re-run variants, so each script destroys its previous copy (elements, listeners, observers, timers) before building again.
  - **Work with the site's own scripts, not against them.** Lenis's opt-out CSS swallowed scrolling over the drawer until the opt-out was limited to when it's needed. Cookiebot's button stays above the drawer so consent stays reachable. The WP Rocket lazy rendering is handled by re-measuring before closing.
- **The pixel button (Figure 1)** is drawn with a single `box-shadow` list:
  - four outer shadows, each offset by one pixel, draw the dark outline with stepped corners
  - two inset shadows draw the top strip and the bottom shadow

  Each state only swaps five custom properties (`--bg`, `--strip`, `--shade`, `--edge`, `--fg`).

## How I tested

All three tasks are covered by **105 automated browser tests** ([tests/](tests/)), written against the brief rather than against my code.

```bash
npm install
npx playwright install chromium   # once
npm test
```

This is dev tooling only: the task files still have no dependencies and no build step.

- **Offline copy of the live site.** The first run records the homepage and the blog once ([tests/record.js](tests/record.js)) at 375, 768 and 1440px, answering the cookie banner and paging through the blog. Every test then replays those recordings. Runs are fast and give the same result each time, and they don't touch GAIN's rate limits. The site's own CSS and JS still run (Lenis, Cookiebot, lazy rendering, the email decoder), so the tests see the real page. The recording is a copy of GAIN's site, so it's gitignored rather than committed. `npm run test:record` refreshes it.
- **Injected the way the brief says.** The CSS goes into `<head>` as a `<style>`. The JS runs as a plain script, the same as pasting it into the console. The document-start bonus test is harsher than Tampermonkey: it runs the scripts before `<html>` even exists.
- **Independent expectations.** The tests read the homepage themselves (the Solutions menu, Our Sectors, the Work and Insights sliders, the footer email). Expected results come from the brief's rules, never from the scripts' own logic. Two tests **edit the homepage before the scripts run**: they rename a service, add a sector, retitle a case study and change the email. They then check that the questionnaire and the drawer follow the edits, which hardcoded values wouldn't.
- **Visual details checked on real pixels.** For Figure 1, the tests sample the rendered button in each state. They check for the lighter top strip, the darker bottom shadow, the dark outline, the notched corners and the square blue focus ring, and that Pressed has no strip or shadow. Animations are checked mid-way, so the chevron must be part-turned and the drawer part-way up 120ms after a click. Screenshot baselines of the button states, the progress bar, the closed tab and the tooltip were approved by eye. Any later change fails the test. On another OS, with different font rendering, they're created on the first run.
- **Every requirement is named.** Each test title quotes the requirement it checks and is tagged `[README]` (a checklist item), `[PDF]` (in the brief but not the checklist), `[Bonus]` or `[Extra]` (beyond the brief). Every checklist item has at least one test named after it. `npx playwright test --list` prints the full map. The `[PDF]` ones:
  - the JS pastes into the console as is (a classic script, no modules), and the CSS is separate and goes into `<head>`;
  - nothing is fetched (a spy on `fetch` and XHR, traced to our scripts);
  - the section sits directly under the hero, and the button is one button with five states;
  - questions 3 and 4 use the brief's exact wording, and the email comes from the footer;
  - the drawer is fixed to the bottom while scrolling, with only the centred tab showing when hidden (Figure 3);
  - the slide description comes from the Solutions menu;
  - Task 3: the article content is gone and clicking a card doesn't open the article; opening `/blog/page/2/` directly starts at #13; only PokeAPI is fetched, once per Pokémon.
- **Task 3 runs against a fake PokeAPI.** The blog is replayed from the recording, so React's real pagination and back/forward run, but PokeAPI answers with made-up Pokémon whose types follow a simple rule (every 4th is Fire, nothing is Dragon). So each test knows exactly which cards a filter should leave, and one test makes a Pokémon fail to check the error card. The no-flash test checks every frame, from before the page exists, while paging and filtering with PokeAPI slowed to 400ms, that no article content and neither of React's dropdowns is ever visible.
- **The tests can fail.** I checked this by breaking three things on purpose: Pressed keeping its top strip, the chevron losing its animation, and the results showing 4 case studies. Each was caught by the test named after that requirement.

What the suite found, beyond what I'd checked by hand:

- **Scrolling over the open drawer didn't work.** The site's Lenis CSS gives every element that opts out of Lenis `overscroll-behavior: contain`. With the mouse over the drawer, nothing scrolled, so the page could never reach the bottom and the drawer never auto-closed. The panel now opts out only when it actually needs to scroll (short screens), and the track undoes `contain` vertically.
- **`waitFor` failed if run before `<html>` existed.** It now observes `document` itself.

## Notes / issues encountered

- _TODO: note any "Just a moment..." rate limiting from the site here._

## Take-home checklist

### All tasks

- [ ] Safe to run more than once on the same page (no duplicate sections, drawers or cards)

### 1. Dynamic Modal: Questionnaire (https://www.thisisgain.com/)

- [x] Uses Flex or Grid CSS
- [x] Works on desktop, tablet and mobile (down to 375px)
- [x] Nothing is hardcoded: options, case studies, articles and the email are read from the homepage
- [x] New section under the hero: header, paragraph and button
- [x] Button UI states match Figure 1 (CSS only)
- [x] Button opens a modal
- [x] 4 question steps + a results step
- [x] Service options match the "Solutions" menu and industry options match "Our Sectors"
- [x] Questions 1 and 2 allow more than one answer, questions 3 and 4 allow one
- [x] Results heading changes with question 4
- [x] Results content changes with question 3 (case studies, articles or email)
- [x] Exact matches first, topped up with labelled related ones (max 3, in slider order), plus the "none" message
- [x] "Right away" always shows the email at the top (only once with "Talk to someone")
- [x] "Talk to someone" + "Just exploring" also shows the 3 latest articles
- [x] Summary of the question 1 and 2 picks, with a way to go back and change them
- [x] Case studies and articles link to their real pages
- [x] Progress bar with active (blue, bold), completed (blue + green checkmark) and next (white) states
- [x] Can't go to the next step until the current one is answered
- [x] Can go back, change an answer, and the results update

### 2. Footer Drawer (https://www.thisisgain.com/)

- [x] Uses Flex or Grid CSS
- [x] Works on desktop, tablet and mobile (down to 375px)
- [x] Sticky drawer at the bottom of the page
- [x] Tab toggles the drawer on/off
- [x] Chevron rotates 180 degrees on toggle
- [x] Drawer slides in and out from the bottom
- [x] Page count and arrow buttons when the drawer is open
- [x] Overlay on the page, and clicking it closes the drawer
- [x] Drawer closes automatically at the bottom of the page
- [x] One slide per case study, read from the "Work" slider (nothing hardcoded or fetched)
- [x] Each slide has an image, header, industry tag with tooltip, service description and link
- [x] Slider is draggable and swipeable on smaller viewports
- [x] Tooltip matches Figure 5 and handles small screens or tight space
- [x] 4+ slides on desktop, 2+ on tablet, 1 on mobile

### 3. SPA DOM Manipulation (https://www.thisisgain.com/blog/)

- [x] Uses Flex or Grid CSS
- [x] Works on desktop, tablet and mobile (down to 375px)
- [x] Every article card shows a Pokémon (image, name, types) based on its position
- [x] No article content flashes before the Pokémon appear (paging and filtering too)
- [x] Pokémon numbers follow the page (page 2 starts at #13)
- [x] "Filter by Tags" hidden, and "Filter by type" lists the 18 regular types and filters the current page, with an empty message
- [x] The chosen type stays selected when changing pages
- [x] Clicking a Pokémon card flips it to show more details, and still works after paging or filtering
- [x] All changes persist through the type filter and paging

### Bonus

- [ ] [Bonus] Animations where they improve the experience
- [ ] [Bonus] Works when it runs before the page has finished loading
