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
- **Prettier** ([.prettierrc.json](.prettierrc.json)) formats the code on save. The config matches the code style: single quotes, semicolons, no trailing commas.

## Design notes

- **Safe to re-run:** every script stores its instance on `window` (for example `window.__gainQuestionnaire`). When it runs again, it calls the previous instance's `destroy()` first. That removes the elements it added, its listeners (through one `AbortController`) and its observers, then the script builds everything again. Running it twice gives the same result as running it once.
- **Works before the page has loaded (bonus):** `waitFor(finder)` takes a selector or a function. It uses a `MutationObserver` on `document.documentElement` and checks again at most once per frame, so the scripts can run at `document-start`. The script starts only once everything it reads from the page is there.
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
- **Overlays and the cookie button:** the site manages consent with Cookiebot, which has a floating button at the bottom left. Consent withdrawal must stay easy to reach (UK/EU GDPR Art. 7(3)), so the two kinds of overlay are treated differently:
  - **The questionnaire modal covers the button.** It's a temporary overlay that the user opened and can dismiss (×, Esc, or a click outside). A modal should sit above the whole page, and the button is back as soon as the modal closes. Without this, the widget sat on top of the modal's Back button on mobile.
  - **The sticky drawer (Task 2) doesn't cover it.** The drawer stays on screen all the time, so it sits below Cookiebot's widget and leaves the button reachable. The site also has a "Cookies" link in the footer.
  - **The first-visit consent banner is never blocked.** The modal only opens when the user clicks Start.

  On a real client site, I'd check this with whoever owns the consent setup.

- **Hover styles inside the modal** are wrapped in `@media (hover: hover)`. Otherwise, on touch screens, `:hover` sticks to the last tapped button (for example, Back stays black after tapping it). The pixel button keeps its plain `:hover`, because Figure 1 requires that state.
- **The drawer's tooltip (Figure 5) when space is tight:** the slider scrolls sideways, so it cuts off anything that sticks out of it, and a bubble centred over the tag (as in Figure 5) would be clipped on the first slide. Instead:
  - The bubble is left-aligned to the tag, which always sits at the slide's left edge, and its arrow is centred on the tag.
  - Its width is capped to the slide with container query units (`100cqi`), so long text wraps inside the slide rather than overflowing. No JS measuring.
  - It opens upward over the image, which has a fixed 16:10 shape, so there's always room. A slide without an image flips it below the tag (`:has()`).
  - Touch has no hover, and Safari doesn't focus a button when it's tapped, so tapping the tag toggles the tooltip. Tapping elsewhere, Esc, scrolling the slider or closing the drawer hides it. Mouse hover and keyboard focus are CSS-only.
- **The pixel button (Figure 1)** is drawn with a single `box-shadow` list:
  - four outer shadows, each offset by one pixel, draw the dark outline with stepped corners
  - two inset shadows draw the top strip and the bottom shadow

  Each state only swaps five custom properties (`--bg`, `--strip`, `--shade`, `--edge`, `--fg`).

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

- [ ] Uses Flex or Grid CSS
- [ ] Works on desktop, tablet and mobile (down to 375px)
- [ ] Sticky drawer at the bottom of the page
- [ ] Tab toggles the drawer on/off
- [ ] Chevron rotates 180 degrees on toggle
- [ ] Drawer slides in and out from the bottom
- [ ] Page count and arrow buttons when the drawer is open
- [ ] Overlay on the page, and clicking it closes the drawer
- [ ] Drawer closes automatically at the bottom of the page
- [ ] One slide per case study, read from the "Work" slider (nothing hardcoded or fetched)
- [ ] Each slide has an image, header, industry tag with tooltip, service description and link
- [ ] Slider is draggable and swipeable on smaller viewports
- [ ] Tooltip matches Figure 5 and handles small screens or tight space
- [ ] 4+ slides on desktop, 2+ on tablet, 1 on mobile

### 3. SPA DOM Manipulation (https://www.thisisgain.com/blog/)

- [ ] Uses Flex or Grid CSS
- [ ] Works on desktop, tablet and mobile (down to 375px)
- [ ] Every article card shows a Pokémon (image, name, types) based on its position
- [ ] No article content flashes before the Pokémon appear (paging and filtering too)
- [ ] Pokémon numbers follow the page (page 2 starts at #13)
- [ ] "Filter by Tags" hidden, and "Filter by type" lists the 18 regular types and filters the current page, with an empty message
- [ ] The chosen type stays selected when changing pages
- [ ] Clicking a Pokémon card flips it to show more details, and still works after paging or filtering
- [ ] All changes persist through the type filter and paging

### Bonus

- [ ] [Bonus] Animations where they improve the experience
- [ ] [Bonus] Works when it runs before the page has finished loading
