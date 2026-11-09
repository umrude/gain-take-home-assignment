# Tampermonkey dev script

[gain-dev.user.js](gain-dev.user.js) injects each task's CSS and JS from this folder at `document-start`, the same way an A/B testing tool would. Edit a file, reload the page, and the change is live. There's nothing to paste.

| Page | Tasks injected |
| --- | --- |
| `https://www.thisisgain.com/` | 1 (questionnaire) + 2 (drawer) |
| `https://www.thisisgain.com/blog/` (and `/blog/page/N/`) | 3 (Pokémon) |

## Setup (once)

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Let Tampermonkey read local files. Open the extensions page (`chrome://extensions` or `edge://extensions`), click **Details** on Tampermonkey, and turn on **Allow access to file URLs**.
3. Turn on **Developer mode** on the extensions page. Recent Chrome versions need it for userscripts to run.
4. In the Tampermonkey dashboard, click **+** (new script), replace everything with the contents of `gain-dev.user.js`, and save.
5. If the repo isn't at `G:\PersonalProjec\GAIN - Interview`, update the six `@resource` paths. Write spaces as `%20`.

## Using it

- Open DevTools and reload the page. Each task logs a line like:
  `[gain-dev] questionnaire injected at loading (css 4210 chars, js 18734 chars)`.
  - **`loading`** means it ran before the page was parsed, which is the bonus scenario.
  - **The character counts** show whether your latest edit was picked up. If they don't change after you save a file, Tampermonkey is serving a cached copy. Open the script in the dashboard and save it again, or bump `@version`.
- The injected code shows up in **DevTools → Sources** as `gain-questionnaire.js` etc., so you can set breakpoints in it.
- To test one task on its own, set `enabled: false` on the others in the `TASKS` list.
- To test the "run twice" requirement, paste the same task file into the console after the page has loaded. You should still see only one section, drawer or set of cards.

## Turning it off

Use the switch next to the script in the Tampermonkey dashboard. Disable it before testing the plain console-paste flow, so both don't run at once.
