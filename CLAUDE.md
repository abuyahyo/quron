# Quron — Claude Code workflow

## Project

Single-page Quran reader (Uzbek translation + Arabic text). Vanilla HTML/CSS/JS, no build step. Three files:

- `index.html` — UI shell, all CSS, all app JS.
- `data.js` — `var QD = [...]` (114 sūras, each verse with `text`/`ar`/`label`/`nums`) and `var KH = "..."` (translator's khatima). Heavy (~4.3 MB) but cached by the Service Worker after first load.
- `sw.js` — cache-first Service Worker.

Served via GitHub Pages from `main` at https://abuyahyo.github.io/quron/.

## Workflow

- Always develop on a Claude branch (the harness assigns `claude/<slug>`).
- Open a PR against `main` when work for a coherent unit is done.
- **Merge the PR yourself** via `mcp__github__merge_pull_request` (method `merge`). The user has authorized this so they don't have to click through.
- After merging, GitHub Pages typically redeploys within ~90 s.
- After merge, fast-forward the local branch from `main` before the next change so commits stay linear.

Never push directly to `main`. Always go through a branch + PR + self-merge.

## Verification before opening a PR

There's no test suite, so do a real browser smoke test before declaring work done:

1. `python3 -m http.server 8765 --bind 127.0.0.1 &` from the repo root.
2. Use Playwright (globally installed at `/opt/node22/lib/node_modules/playwright`, CommonJS — `require()` it) with headless Chromium.
3. Confirm: home grid renders 114 cards, opening a sūra renders Arabic + Uzbek per verse, hash routing (`#/2/255`) works, settings popover opens, theme toggle, search returns results, no JS console errors.
4. Take screenshots at `width: 412` (mobile) and `width: 1280` (desktop) and read them back to sanity-check layout — typography rendering depends on Google Fonts which may fail in the sandbox (cert error), so judge layout/spacing not Arabic glyph quality.

## Editing notes

- The file mixes literal Cyrillic characters and `\uXXXX` escapes in JS string literals (a relic of the original upload). The `Edit` tool sometimes can't match strings containing these escapes — fall back to a small Python script that reads the file as UTF-8 and does an exact `str.replace`.
- Keep `data.js` separate; never inline it back into `index.html`. The Service Worker caches them as separate entries so a UI-only change doesn't force re-downloading the Quran payload.
- Verse objects use `nums: [n, ...]` to map back to canonical Arabic ayah numbers (some Uzbek "rows" combine multiple ayahs, e.g. Fatiha's `6-7`). When joining Arabic for combined rows, separate with a single space.
- Sura cards are `<a href="#/N">` so they're shareable; `text-decoration: none; color: inherit;` is required or the multi-line names get underlined.
- Theme: CSS custom properties on `:root` (dark) and `.light` (light). `--header-bg` is theme-aware so don't hardcode `rgba(...)` for the header.
- Search precomputes `_nl` (sūra name lowercase) and `_tl` (verse text lowercase) on load — keep that path; do not call `toLowerCase()` per keystroke.
