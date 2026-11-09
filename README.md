# GAIN Take-Home Assignment

Three console-injected experiments for https://www.thisisgain.com/, written in plain CSS and vanilla JavaScript.

## How to run

Each task has two files:

| Task | JS (paste into the console) | CSS (inject into `<head>`) | Page |
| --- | --- | --- | --- |
| 1. Dynamic Modal (Questionnaire) | [task-1-questionnaire/questionnaire.js](task-1-questionnaire/questionnaire.js) | [task-1-questionnaire/questionnaire.css](task-1-questionnaire/questionnaire.css) | https://www.thisisgain.com/ |
| 2. Footer Drawer | [task-2-footer-drawer/drawer.js](task-2-footer-drawer/drawer.js) | [task-2-footer-drawer/drawer.css](task-2-footer-drawer/drawer.css) | https://www.thisisgain.com/ |
| 3. SPA DOM Manipulation | [task-3-spa-pokemon/pokemon.js](task-3-spa-pokemon/pokemon.js) | [task-3-spa-pokemon/pokemon.css](task-3-spa-pokemon/pokemon.css) | https://www.thisisgain.com/blog/ |

1. Open the page.
2. Inject the CSS into `<head>`. The A/B tool does this in production. To do it by hand, paste this into the console with the CSS between the backticks:
   ```js
   document.head.insertAdjacentHTML('beforeend', '<style id="gain-css-task-N">' + `/* CSS here */` + '</style>');
   ```
3. Paste the JS file into the console and press Enter.

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

## Notes / issues encountered

- _TODO: note any "Just a moment..." rate limiting from the site here._

## Take-home checklist

### All tasks
- [ ] Safe to run more than once on the same page (no duplicate sections, drawers or cards)

### 1. Dynamic Modal: Questionnaire (https://www.thisisgain.com/)
- [ ] Uses Flex or Grid CSS
- [ ] Works on desktop, tablet and mobile (down to 375px)
- [ ] Nothing is hardcoded: options, case studies, articles and the email are read from the homepage
- [x] New section under the hero: header, paragraph and button
- [ ] Button UI states match Figure 1 (CSS only)
- [x] Button opens a modal
- [ ] 4 question steps + a results step
- [ ] Service options match the "Solutions" menu and industry options match "Our Sectors"
- [ ] Questions 1 and 2 allow more than one answer, questions 3 and 4 allow one
- [ ] Results heading changes with question 4
- [ ] Results content changes with question 3 (case studies, articles or email)
- [ ] Exact matches first, topped up with labelled related ones (max 3, in slider order), plus the "none" message
- [ ] "Right away" always shows the email at the top (only once with "Talk to someone")
- [ ] "Talk to someone" + "Just exploring" also shows the 3 latest articles
- [ ] Summary of the question 1 and 2 picks, with a way to go back and change them
- [ ] Case studies and articles link to their real pages
- [ ] Progress bar with active (blue, bold), completed (blue + green checkmark) and next (white) states
- [ ] Can't go to the next step until the current one is answered
- [ ] Can go back, change an answer, and the results update

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
