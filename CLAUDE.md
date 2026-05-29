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
5. For any change touching search, display, copy, or navigation, run `regression-test.js` in the repo root (`node regression-test.js` against the local server) — it asserts ~22 checks across every feature and exits non-zero on failure. Faster and safer than re-checking by hand. Add a case when you add a feature.

**Writing browser tests:** literal Arabic/Cyrillic inside a Node heredoc gets mangled by the shell — write the test to a `.js` file (via the Write tool) and `node` it, or paste only ASCII. Reserved words like `var` can't be used as JS variable names in the test either.

## Editing notes

- The file mixes literal Cyrillic characters and `\uXXXX` escapes in JS string literals (a relic of the original upload). The `Edit` tool sometimes can't match strings containing these escapes — fall back to a small Python script that reads the file as UTF-8 and does an exact `str.replace`.
- Keep `data.js` separate; never inline it back into `index.html`. The Service Worker caches them as separate entries so a UI-only change doesn't force re-downloading the Quran payload.
- Verse objects use `nums: [n, ...]` to map back to canonical Arabic ayah numbers (some Uzbek "rows" combine multiple ayahs, e.g. Fatiha's `6-7`). When joining Arabic for combined rows, separate with a single space.
- Sura cards are `<a href="#/N">` so they're shareable; `text-decoration: none; color: inherit;` is required or the multi-line names get underlined.
- Theme: CSS custom properties on `:root` (dark) and `.light` (light). `--header-bg` is theme-aware so don't hardcode `rgba(...)` for the header.
- Search precomputes per-item keys on load (one pass over `QD`) — keep this path; never normalize per keystroke. The keys: `_nl` (sūra name lowercase), `_nll` (Latin search key of the name), `_anl` (normalized Arabic name); per verse `_tl` (text lowercase), `_tll` (Latin key), `_al`/`_als` (loose / strict Arabic), and `_jn` (lazy jannah key, memoized on first use).
- When walking `data.js` with regex to swap a JSON string value, use `(?:[^"\\]|\\.)*` for the body — naive `[^"]*` truncates at the first escaped `\"` and silently corrupts long descriptions that contain quoted phrases.

## Search & display features

The single search box drives several layers, all in `index.html`. When changing any of them, re-run the regression test (a Playwright script that asserts ~22 checks across every feature below; write it to `/tmp/*.js` and `node` it against the local server).

**Arabic normalization (three levels):**
- `normAr(s)` — loose: strips harakat, folds hamza/alif/ta-marbuta, and **drops a word-initial definite article** `ال` when the stem is ≥3 letters (so `المقام` matches `مقام`). Article-insensitive.
- `normArStrict(s)` — keeps harakat (maps presentation-form vowels to standard). Used by `arRe`.
- `arRe(q)` — builds a regex from a (partly) voweled query: each consonant in order, and **only the short vowels the user actually typed** are required on their consonant (bare consonants match any vowel). This is what keeps `الجَنَّة` (fatha) distinct from `الجِنّة` (kasra). `hasVowel(q)` decides whether to use it.

**Search routing in `renderVerseHits` / `buildGrid`:**
- Uzbek text matches `_tl`; Latin-typed queries match `_tll`.
- Arabic: if the query has harakat, match per-vowel via `arRe` against `_als`; else loose substring against `_al`.
- `arStrip` flag: the default Arabic search is **article-preserving**; if stripping the article *would* find verses, a "Артиклсиз қидириб кўриш / Артиклсиз ҳам қидириш" button is offered. Clicking it sets `arStrip` and re-runs (also vowel-aware, so `ٱلْمَوْتَة` doesn't over-match `مَوْتِهَا`). The button is **gated**: only shown when the stripped query actually has hits. Flag resets every keystroke.

**Verse-reference search (`parseRef`/`parseSeg`):** `Бақара сураси, 25-оят`, `Бақара 25`, or several refs separated by `*`, `;`, newline, **or split after each `оят`/`аят`** (so space-separated lists work). Sura-name lookup tolerates Uzbek variants (`refNorm` folds қ→к, ғ→г, ҳ→х, ў→у, drops ъ/ь) and a 1-char edit distance (`ed1`, so `ниса`→Нисо). Renders `#refHit` cards above the grid with a per-card copy button and, for multi, a count + "Барчаси".

**Jannah ("all names of Paradise") smart search:** `jannahTrig(q)` shows a gold `.jannah-sug` button when the query relates to paradise (Uzbek жаннат/фирдавс/адн, or Latin jannat/firdav, or any Arabic key). `App.jannah()` sets `jannahMode` and `jannahHits()` returns the union of: Uzbek keywords (`JANNAH_UZ`) **and** the Arabic keys (`JANNAH_RAW`, normalized via the alif-**preserving** `normJ`). Two special-cases prevent false positives: the `الجنة` key skips words with jim+kasra (`الجِنّة` = jinn, not paradise), and `الحُسْنَى` is kept only when the Uzbek text signals paradise (it's polysemous — also "Allah's beautiful names"). When adding keys, prefer full phrases (`جنة الخلد`) over bare roots whose other senses leak in (`الخلد` alone = eternal *hellfire* in 25:15). Always cross-check a candidate key against the data before adding it.

**Cyrillic ↔ Latin display toggle:** `scriptMode` ('cyr'|'lat', persisted as `scr`). `cyr2lat` does standard Uzbek transliteration (ў→o', ғ→g', қ→q, ҳ→h, х→x, ч→ch, context-aware е→ye/e, ъ→'). It's a **lossless display transform**: `applyScript()` runs a TreeWalker on load and a MutationObserver for later renders, storing each text node's original Cyrillic in a `WeakMap` (`_ORIG`) so switching back restores it exactly — never reverse-transliterate. Arabic/RTL/input nodes are skipped. The `<title>` is swapped separately (it's outside `<body>`). Search works in both scripts via the precomputed `_nll`/`_tll` keys.

**Copy modes:** `copyMode` (persisted `cpm`): `both` (Arabic+Uzbek, default), `uz`, `ar`, `ref` (reference only, e.g. `Бақара сураси, 82-оят`). Honored by every copy path (`cpRef`, `cpHit`, `cp`, `selCopyDo`, `cpRefAll`) via `cpWantAr`/`cpWantUz`/`cpRefText`.

**Back navigation:** `goBack()` (the in-page "Орқага" and the empty-hash path) preserves the search box text, results, and scroll position; the logo and float-home button do a full `goHome()` reset.

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
