# Quron — Claude Code workflow

## Project

Single-page Quran reader (Uzbek translation + Arabic text). Vanilla HTML/CSS/JS, no build step. Two files:

- `index.html` — UI shell, all CSS, all app JS. On load it registers `sw.js` and calls `registration.update()` so a freshly-deployed SW is picked up on the very next visit.
- `data.js` — `var QD = [...]` (114 sūras, each verse with `text`/`ar`/`label`/`nums`) and `var KH = "..."` (translator's khatima). Heavy (~4.3 MB) but the browser HTTP cache handles it.
- `sw.js` — PWA service worker. **Network-first** for `index.html` and `data.js` (always fresh when online, cached fallback when offline), **stale-while-revalidate** for icons and Google Fonts. Uses `skipWaiting()` + `clients.claim()` so an updated SW activates immediately; `activate` deletes any cache whose name doesn't match the current `CACHE_NAME`. Emergency hatch: visiting `?killsw=1` on any path nukes every cache and unregisters the SW.

This was a real headache historically: the project once shipped a cache-first SW that pinned users to stale `index.html`/`data.js` forever. The current SW deliberately treats those two as network-first to avoid repeating that, while still giving offline support for everything else. **Do not switch the HTML or `data.js` strategy back to cache-first** without an explicit ask.

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
- When walking `data.js` with regex to swap a JSON string value, use `(?:[^"\\]|\\.)*` for the body — naive `[^"]*` truncates at the first escaped `\"` and silently corrupts long descriptions that contain quoted phrases.

## data.js cache busting

`data.js` is ~4.3 MB and aggressively cached by browsers (iOS Safari especially). The `<script src="data.js?v=YYYYMMDD">` tag in `index.html` carries a query-string version. **Bump the `v=` value whenever `data.js` changes substantively** so returning visitors fetch the new payload instead of replaying their cached copy. Symptom of forgetting: descriptions or verses look truncated/old on the live site even though they're correct in the repo.

## sw.js cache version

`sw.js` has a `CACHE_VERSION` constant near the top. The SW name is `quron-<CACHE_VERSION>` and `activate` wipes any other cache. **Bump `CACHE_VERSION` whenever the pre-cached app shell changes** (icons, the SW logic itself, or anything in the `APP_SHELL` array) — that's how stale shell entries get cleared from returning users. You do not need to bump it for ordinary HTML/JS edits, because those go through the network-first path and refresh automatically; bump only when you've changed the shell list or want to force-evict everyone's cache.

## Floating UI / popovers

The sticky `header` uses `backdrop-filter: blur(...)`, which creates a containing block for `position: fixed` descendants. **Any popover or floating button that should anchor to the viewport must live at the body level, not inside `<header>`.** The settings popover lives directly under `<body>` for this reason — moving it back into `.header-actions` will trap fixed positioning inside the 58 px header.

## Sūra descriptions

The canonical source for the long sūra descriptions is `kutubxona_elektron-quron.pdf` in the repo root. Extraction recipe:

1. `pdftotext -layout kutubxona_elektron-quron.pdf -` to dump the layout-preserving text.
2. Each description starts at a line matching `^\(N\) «Name» сураси` and ends at the first verse line (`^\d+(-\d+)?\. ` or the bismillah-translation line `^Меҳрибон ва раҳмли Аллоҳ номи билан`).
3. Paragraph breaks: a wrapped line that ends with `.?!»` AND is shorter than ~75 chars is the end of a paragraph (the PDF wraps at ~85 chars). Emit `\n\n` between paragraphs.
4. `.sura-pg-desc` has `white-space: pre-line` so `\n` and `\n\n` in the data render as real line breaks.
