# Movie-App — Build Journal

Append-only record of how this app got built. **Newest entry at the top. Never edit or delete a past entry** — if something turned out wrong, add a new entry saying so.

## What this file is for

`CLAUDE.md` says what the app **is now**. This file says **why it is that way**, so the app can be rebuilt clean from scratch without re-walking any dead end.

Together they are the rebuild spec:
- `CLAUDE.md` → the target (stack, schema, API, deploy)
- `JOURNAL.md` → the traps (what we tried, what broke, what we rejected and why)
- `plans/<slug>.md` → the agreed design for each feature, as of the day it was built

A future rebuild reads `CLAUDE.md` to know what to build, then skims this file to know what not to try.

## How to write an entry

Written by `/sync` at the end of every session that changed behaviour, and at any planning iteration that changed a decision. One entry per change. Keep **Rejected** and **Gotchas** honest and specific — they are the two fields that make a rebuild cheaper, and the two most often left vague.

---

## Rebuild notes — load-bearing decisions

Decisions that would be expensive or dangerous to get wrong on a rebuild.

| # | Decision | Why | Entry |
|---|----------|-----|-------|
| 1 | Friends' **CSV exports** are the primary source for their ratings; RSS is only a top-up | RSS is a rolling ~50-entry window, not history. Measured: it covered 6 of 170 watched films | 2026-08-19 #1 |
| 2 | IMDb ranking **must** filter `title.basics.titleType === 'movie'` | Unfiltered, the top of IMDb's ratings file is TV episodes rated 9.9; a naive top-500 is almost all television | 2026-08-19 #2 |
| 3 | Vote floor of **50,000** on the IMDb pool | Below it, regional hits with concentrated fanbases outrank canonical films; above it the pool collapses and quality falls | 2026-08-19 #2 |
| 4 | There is **no real "Rotten Tomatoes top 500"** — any RT ranking is derived from whatever pool we enriched | RT has no public API; enterprise access starts at $60k/yr | 2026-08-19 #2 |
| 5 | Films keyed by **TMDB id** where known, `boxd.it` URI otherwise | Letterboxd CSV carries no TMDB id, so CSV-only films need title+year resolution, which mis-hits on remakes and alternate cuts | 2026-08-19 #1 |
| 6 | `Math.random()` is permitted **only** inside the shuffle handler | The project rule bans random for derived values (colours, ids, sort keys); a user-triggered dice roll is the opposite requirement | 2026-08-19 #2 |
| 7 | **Never render a metadata value we did not source** — unknown means an explicit dash | Fabricated placeholder data is indistinguishable from a bug, and cost a full review cycle to unpick | 2026-08-19 #3 |
| 8 | Use `>>>` (unsigned) for any shift on a 32-bit hash | A signed `>>` goes negative above 2^31, yielding `undefined` array lookups on roughly 40% of inputs | 2026-08-19 #3 |
| 9 | Directors come from `title.crew` + `name.basics`, not an API | Free, offline, and covers 674,368 credited movies | 2026-08-19 #3 |

---

## Entries

### 2026-08-19 #3 — Top 1000, top-50 directors, and three mockup bugs fixed

**Branch:** n/a (planning) · **Plan:** `plans/discover-and-shuffle.md` · **Status:** mockup v3 built

**What changed**
- Pool widened from top 500 to **top 1000** (score floor 9.3 → 7.5). Discover tab now 892 unseen films.
- New **Top-50 directors** tab from the requested IMDb list (`ls071439230`). All 837 feature films by those 50 directors are in the database; 791 are unseen.
- **All invented metadata removed.** Runtime, genres, director and IMDb score now come from IMDb's official datasets for every resolved film — **167 of the 170 watched films matched**. Anything genuinely unknown renders as an explicit `—` rather than a plausible-looking value.
- Director filter added, driven by real credits.

**Why**
- The user reported the metadata was "wrong". It was: it was deliberately fabricated placeholder data, marked only by faded italic styling. That signal was far too weak — fabricated data that looks real is worse than no data, because it cannot be distinguished from a genuine bug. Replaced with real data where it exists and blanks where it does not.

**Rejected**
- **Keeping placeholder metadata with a louder warning** — no styling makes invented numbers safe. The rule now is: never render a value we did not source.
- **Fetching directors from TMDB** — unnecessary. `title.crew.tsv.gz` + `name.basics.tsv.gz` give real directors for all 674,368 credited movies, free and offline.
- **Restricting the directors tab by vote count** — the request was explicitly *all* their films. 837 is manageable; sorted by popularity so the obscure ones fall to the bottom.

**Gotchas discovered**
- **Signed right-shift on a 32-bit hash produces negative array indices.** `hash()` returned an unsigned 32-bit int via `>>> 0`, but the derived values used `n >> 5`, a *signed* shift. For any `n ≥ 2³¹` the result is negative, so `ARRAY[negative % len]` returned `undefined` — 272 cards showed "undefined" as the director and 90 as a genre. Use `>>>` throughout, or mask with `& 0x7fffffff`. Fails silently and only on ~40% of inputs, so it survives casual testing.
- **A served HTML file with no `<meta charset>` is decoded as windows-1252, not UTF-8.** Every `·`, `★` and `½` rendered as `Â·` and `â˜…â˜…`. `fs.writeFileSync(..., 'utf8')` writes correct bytes; the browser still guesses wrong without the meta tag. Always emit `<meta charset="utf-8">` as the first line.
- **`file://` pages cannot be verified through the preview pane, and a sandboxed viewer may not run scripts at all.** The interactive features were reported as "not working" while in fact they worked — they had simply never executed in the viewer used. Verify interactive HTML over a real `http://` server and drive it, rather than trusting a static render.
- **A naive Windows static server rejects every path.** `path.join()` returns backslashes while a `ROOT` constant written with forward slashes does not, so a `startsWith(ROOT)` traversal guard rejects everything with a 404. Normalise with `path.resolve()` on both sides.

**Files touched**
- `scripts/build-mockup.js` — rewritten: real-data-only, streams four IMDb datasets, no fabrication
- `scripts/serve.js` — local static server for verifying the mockup properly
- `data/top50-directors.json` — the 50 directors with their IMDb ids, extracted from the list
- `mockup-browse.html` — regenerated as v3, 1,890 cards across four tabs

---

### 2026-08-19 #2 — Discover (IMDb top 500) & Shuffle — planned

**Branch:** n/a (planning) · **Plan:** `plans/discover-and-shuffle.md` · **Status:** awaiting agreement

**What changed**
- Added a **Discover** tab: the IMDb top 500 minus everything already seen — 423 films, each flagged if already on the watchlist.
- Added a **Pick one for me** button that picks from the currently filtered set, with a roll-again panel.
- Mockup rebuilt (v2, 630 cards). Real vs placeholder data is now visually distinguished — placeholders render faded and italic.

**Why**
- The Letterboxd export alone is 207 films, too small to browse for something new. A catalogue of well-regarded films that explicitly excludes what has been seen turns the app from a record into a recommender.
- IMDb publishes official daily datasets, so the catalogue needs no scraping and no API key.

**Rejected**
- **Scraping IMDb's Top 250 page** — unnecessary; the official dataset is richer, legal and machine-readable. Also only 250 entries.
- **A genuine RT top 500** — impossible. RT has no public API and enterprise access starts at $60,000/yr. Any RT ranking must be derived from a pool we enriched via OMDb, and the UI has to say so rather than implying it is RT's own list.
- **Vote thresholds of 25k / 100k / 250k** — 25k lets *The Chaos Class* (46k votes) outrank *The Lord of the Rings*; 250k shrinks the pool to 1,044 films, so the top 500 is half of it and the score floor *drops* to 7.4. 50k measured best.
- **Shuffling across everything regardless of filters** — makes the button useless. The real use case is "a comedy under 100 minutes I haven't seen".

**Gotchas discovered**
- **IMDb's ratings dataset is dominated by TV episodes at the top.** `title.ratings.tsv.gz` has no type column. The highest-rated entries clearing any sane vote floor are *Game of Thrones* episodes at 9.9 — episodes are rated only by people already invested in the series, so they systematically outscore feature films. Fix: join against `title.basics.tsv.gz` and keep only `titleType === 'movie'`. The naive approach fails silently — the list looks plausible until you notice none of it is films.
- **`title.basics.tsv.gz` is 226 MB and must be streamed, not read into memory.** Load the ratings file first, filter to titles clearing the vote floor (~4.6k), then stream basics and keep only those ids. Reading 12.7M rows into an array will not survive.
- **Title matching produces confident-looking false negatives.** *Kill Bill: The Whole Bloody Affair* does not match a logged *Kill Bill: Vol. 1* — correct here, but the same mechanism will mis-handle alternate cuts, re-releases and translated titles in both directions. Needs a match-confidence field and a review queue, not just a boolean.

**Files touched**
- `plans/discover-and-shuffle.md` — new plan, findings F8–F13
- `mockup-browse.html` — regenerated as v2 with the third tab and the shuffle panel

---

### 2026-08-19 #1 — Browse & Filter — planned

**Branch:** n/a (planning) · **Plan:** `plans/browse-and-filter.md` · **Status:** awaiting agreement

**What changed**
- Established the core screen: two tabs (Seen / To Watch) over a shared filter bar — genre, IMDb, RT, runtime, director, year — with friend ratings on each card.
- Set the data model: one `films` store keyed by TMDB id, with a per-person `views` map.
- First mockup generated from the real export.

**Why**
- Planning ahead of code, per the project workflow. Every design choice below was driven by a measurement, not an assumption.

**Rejected**
- **Building on the Letterboxd API** — request-only, no guaranteed access, cannot be a dependency.
- **Scraping Letterboxd profiles for friend ratings** — against ToS, and technically blocked: their HTML pages return 403 to automated clients while RSS returns 200.
- **RSS as the primary source for friend ratings** — this was the original plan and the measurement killed it. See gotcha below.
- **Filtering on your own rating** — the distribution is too tight to be useful: 60 films at 4★, 39 at 4.5★, 21 at 5★, only 6 below 2.5★. Filters lean on external scores instead.

**Gotchas discovered**
- **Letterboxd RSS is a rolling ~50-entry window, not history, and it does not backfill.** Measured: `Regelegorila` 85 feed items of which 50 carry ratings, overlapping just **6** of the 170 watched films; `thiboudon` returns an entirely empty feed. The naive assumption — that public feeds could carry a "friends' ratings" feature — is off by two orders of magnitude. Fix: friends' CSV exports are the primary source, RSS only tops up new activity.
- **Letterboxd serves RSS to bots but 403s its own HTML pages.** Any design that needs to follow a `boxd.it` link server-side will fail.
- **The CSV export carries no TMDB id — the RSS feed does.** CSV gives `boxd.it` short URI + name + year only. So CSV-only films must be resolved by title+year, while RSS entries arrive with the real id and can auto-correct the map.

**Files touched**
- `plans/browse-and-filter.md` — new plan, findings F1–F7
- `mockup-browse.html` — first mockup, generated from the real export
- `JOURNAL.md`, `.claude/commands/sync.md`, `.gitignore`, `CLAUDE.md` — synced from the starter
