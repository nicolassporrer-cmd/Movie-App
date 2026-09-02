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
| 10 | **One film store keyed by `tconst`; tabs are views over it, never their own lists** | Per-tab lists silently duplicate any film belonging to two collections | 2026-08-19 #4 |
| 11 | Collection membership lives in `data/collections.json`, not in code | Which films count as "Nouvelle Vague" is an editorial judgement and must stay visible and arguable | 2026-08-19 #4 |
| 12 | Resolve every person by lookup in `name.basics`, disambiguated on profession and birth year | Name collisions are common and attach an entirely wrong filmography without erroring | 2026-08-19 #4 |
| 13 | **User removals are an exclusion list keyed by IMDb id, never a delete** | The database is regenerated from the IMDb datasets, so a deleted row reappears on the next build; an exclusion survives | 2026-08-19 #5 |
| 14 | Any count shown next to a runtime-mutable collection must be computed client-side | Build-time counts go stale the instant something can be removed | 2026-08-19 #5 |
| 15 | **OMDb is the only external key needed** — it returns RT, Metacritic *and* a hotlinkable poster URL | Verified by probe; removes the TMDB dependency entirely | 2026-08-19 #6 |
| 16 | Never source images by web-image search | Returns whatever ranks rather than the verified film, so errors are undetectable at scale | 2026-08-19 #6 |
| 17 | A popover must be re-tested at phone width; resetting its *container* to `position: static` does not un-float the panel | The absolutely-positioned element is the one that overlays content — the genre panel sat on top of the film grid on mobile while looking correct on desktop | 2026-09-01 #16 |
| 18 | A shared component class must declare `flex-direction` explicitly when it can render inside `.filters` | `.filters label` sets `column` and outranks a bare `.chip`, so every filter-bar chip silently stacked its checkbox, name and count for weeks | 2026-09-01 #16 |
| 19 | A "do we already have this director?" check must match on the IMDb id or the full folded name — never the surname | A surname fallback reported Spike Lee as present because Ang Lee was configured | 2026-09-02 #17 |
| 20 | Never filter candidate people on `name.basics.primaryProfession` | It is IMDb's top-3 billing, not a credit list: John Carpenter is `music_department,writer,composer` with no `director`. Confirm identity from `knownForTitles`, assign films from `title.crew` | 2026-09-02 #17 |

---

## Entries

### 2026-09-02 #17 — Twenty directors requested; eleven were already complete, nine were not

**Branch:** `main` · **Status:** shipped

**Checked first, added second.** Of the 20 names asked for, 11 were already
configured *and* verified complete — every released film already in the library:

Giuseppe Tornatore (16), Ingmar Bergman (42), Wim Wenders (43), Woody Allen (51),
Charles Chaplin (17), Miloš Forman (16), Terrence Malick (10), Sidney Lumet (44),
Orson Welles (28), Paul Thomas Anderson (11), Alejandro G. Iñárritu (10).

Nine were missing **146 films** between them, now added:

| Director | IMDb id | Films | Were in db |
|---|---|---|---|
| Luis Buñuel | nm0000320 | 32 | 2 |
| Spike Lee | nm0000490 | 36 | 8 |
| Richard Linklater | nm0000500 | 25 | 7 |
| Gus Van Sant | nm0001814 | 22 | 4 |
| John Carpenter | nm0000118 | 18 | 2 |
| Jafar Panahi | nm0070159 | 15 | 2 |
| Gaspar Noé | nm0637615 | 12 | 2 |
| John Cassavetes | nm0001023 | 12 | 0 |
| Ari Aster | nm4170048 | 4 | 3 |

Library **3,263 → 3,409**, matching the predicted +146 exactly.

**Two traps hit while resolving the ids**

- **Last-name matching said we already had Spike Lee. We had Ang Lee.** A
  presence check that falls back to surnames will report a director as covered
  when a different person shares the surname. Any "do we have X" check must be
  confirmed on the id or the full folded name, never the surname alone.
- **`name.basics.primaryProfession` does not list John Carpenter as a director.**
  It reads `music_department,writer,composer` — it is IMDb's top-3 billing, not a
  credit list. Filtering candidate names on `/director/` silently returned zero
  for him. Identity was confirmed instead from `knownForTitles` (Halloween, The
  Fog, Dark Star, They Live), and film assignment comes from `title.crew` as
  always, which is authoritative.

**Verified**

- 20/20 directors complete against their full IMDb filmography — 464 films, zero missing
- Of the 146 new: 146 have a runtime and a director, 145 an IMDb score, poster and
  synopsis, 121 an RT score, **0 with a missing or `undefined` director**
- Spot-checked against real values: Halloween (1978, 91m, RT 97), A Woman Under the
  Influence (1974, 155m, RT 88), The Discreet Charm of the Bourgeoisie (1972, RT 98)
- Provider buckets reconcile to 3,409 in both US and FR
- All nine appear in the director dropdown, now 136 names
- Buñuel's *Los Olvidados* is present under IMDb's primary title, *The Young and the Damned*

Same run also picked up 3 newly watched films from Letterboxd (seen: 185).

### 2026-09-01 #16 — Multi-select genre filter, and the mobile panel that overlaid the grid

**Branch:** `main` · **Status:** shipped

**What changed**

The single-choice genre `<select>` became a picker of 23 tickable chips, each labelled
with the number of films it holds. Matching is a **union**: Crime + Thriller + Drama
returns the 2,522 films in any of the three. Intersection was considered and rejected —
barely a handful of films carry three specific genres at once, so an intersecting filter
would return a near-empty list and read as broken rather than precise.

- `src/GenrePicker.jsx` — new component, 23 chips with counts
- `src/constants.js` — `DEFAULT_FILTERS.genre: ''` → `genres: []`
- `src/App.jsx` — `f.g.some(g => filters.genres.includes(g))`, plus a `genreCounts` memo
- `src/Filters.jsx` — `<select>` replaced by `<GenrePicker>`
- `src/styles.css` — `.genrep-*`, styled to match the subscriptions picker

**The bug that shipped with it**

The panel was `position: absolute` at every width. On desktop that is correct — a popover
floating over the page. On a 375px phone the same rule made it float **on top of the film
grid**, which is what the user saw and reported: "it appears weirdly below on top of the
movies list, it does not work". The earlier mobile media query only reset `.genrep` to
`position: static` and stretched the panel `left: 0; right: 0` — the panel itself stayed
absolute, so it still overlaid the grid at full width. Resetting the *container* does
nothing; the positioned element is the one that has to change.

Fix, under `@media (max-width: 560px)`: the panel becomes `position: static`, full width,
`max-height: 46vh` with `overflow-y: auto`. It now opens in the normal flow directly under
the button, pushes the grid down, and scrolls internally.

**Verified** (375×812, real build, not the dev server)

| | |
|---|---|
| Panel bottom / first card top | 736 / 1174 — no overlap |
| Internal scroll | 564px of chips in a 372px box; last chip (Western) reachable |
| Crime + Thriller + Drama | 2,522 films — matches the figure computed from the dataset |
| Closing the panel | grid moves back up 381px, selection retained |
| Horizontal scroll | none |
| Desktop at 1280px | still `absolute`, 320px, no internal scroll — unchanged |

**Follow-up the same day: one genre per line**

Wrapped pills were hard to scan — the names start at a different x on every row.
The list is now vertical: one full-width row per genre, checkbox on a fixed left
edge, count flush right, 23 rows scrolling inside the panel (`max-height:
min(62vh, 520px)` on desktop, 46vh on mobile).

Doing this surfaced a **pre-existing bug in the shared `.chip` rule**. `.filters
label` sets `flex-direction: column` and outranks a bare `.chip` — (0,1,1) beats
(0,1,0) — so every chip in the filter bar had been stacking its checkbox, name
and count vertically: 90px-tall rows instead of 38. It hit the subscriptions
picker too, and had been live since that picker shipped. It went unreported
because a column of tall pills still looks deliberate. Fixed by declaring
`flex-direction: row` explicitly on `.genrep-list .chip, .subs-list .chip`.

Verified: genre rows 38–39px, one per line, checkbox at x+5, count 5px off the
right edge; subscription pills back to 31px wrapping horizontally; 2,522 still
correct; desktop popover unchanged at 320px, now scrolling internally.
### 2026-08-27 #15 — Removed superseded data files and the mockup generator

**Branch:** `main` · **Status:** shipped

**What was deleted, and what each thing was**

| File | What it did | Superseded by |
|---|---|---|
| `data/providers-us.json` (304 KB) | US streaming availability, fetched per region | `providers-world.json` — one call returns all 48 countries |
| `data/providers-fr.json` (262 KB) | France, fetched in a second pass purely for Canal+ | same |
| `data/top50-directors.json` (3 KB) | The 50 directors scraped from IMDb list `ls071439230` | `directors.json` — after 5 removals and 14 additions it was no longer the top 50, and the name lied |
| `data/films.json` (293 KB) | Film list emitted by the mockup generator | `public/data/films.json`, written by `build-data.cjs` |
| `scripts/build-mockup.cjs` (~30 KB) | Generated the standalone HTML mockup used for `/plan` before the React app existed | The app itself, entry #9 |

About 890 KB, referenced by nothing since entry #13.

**Why**
- Dead files are not free. They read as live, so a future session — mine included — would have to prove they were unused before touching anything nearby. `providers-us.json` and `providers-world.json` sitting side by side is exactly the kind of ambiguity that causes someone to update the wrong one.
- The reasoning behind each was already recorded (#3, #8, #9, #13); only the removal was missing, which is what this entry adds.

**Rejected**
- **Keeping them as a fallback.** They are regenerable — `enrich-tmdb.cjs` rebuilds availability from scratch in about six minutes — and git holds every version anyway. A stale cache kept "just in case" is a trap, not a backup.
- **Deleting without recording it.** The user's condition was that the journal explain them first. It covered the reasoning but not the deletion, so the entry came first and the `rm` second.

**Verification**
`grep` across `scripts/`, `src/` and `.github/` found no references. The pipeline and build were run afterwards to confirm nothing depended on them.

**Files touched**
- Deleted the five above; `scripts/serve.cjs` kept — still used to check a build locally.

---

### 2026-08-21 #14 — The deploy published the wrong commit; Wim Wenders; monitoring rewritten

**Branch:** `main` · **Status:** shipped

**What changed**
- Fixed the deploy publishing a stale commit. **Enrichment is now complete: 2,217 of 2,235 films have posters, and the OMDb cache covers the entire library.**
- Added **Wim Wenders** — 43 features, 1971–2023.
- Rewrote the morning check to compare the live site against the repo rather than trust a run's conclusion.

**Why**
- Yesterday's publish job ran, went green, and deployed the previous day's data. `actions/checkout` defaults to the SHA that *triggered* the run; the scheduled run began at 08:09:12 on `1a776aa`, and the refresh committed `0b1d806` at 08:10:53. The publish job checked out the state from before its own run. Pinning `ref: main` makes it always publish the current tip.

**Rejected**
- **Passing the new SHA into the reusable workflow as an input.** Works, but couples the two workflows for no benefit — the deploy should always publish the tip of `main`, whatever produced it.
- **Trusting the workflow conclusion in the morning check.** It reported success through both publish failures. A conclusion that is true and useless is worse than no check, because it manufactures confidence.

**Gotchas discovered**
- **A called workflow does not appear in its own workflow's run list.** `publish` runs nested inside `daily-refresh`, so `deploy.yml`'s run history showed nothing for today and I initially concluded the deploy had not run at all. It had — and had succeeded, on the wrong commit. To see it, fetch the parent run's jobs and look for `publish / build`.
- **"Green run" and "site updated" are independent facts.** Two different failures in three days, both with every step reporting success: the commit not triggering a deploy, then the deploy building the wrong commit. **The only reliable check is comparing the bytes the live site serves against the bytes in the repo.** Both were found because the user asked whether it had worked, not because anything reported a problem.
- **A full rebuild can lose a recently-watched film.** The seen count went 178 → 177 after `npm run data`: the rebuild takes watched films from the CSV export plus the RSS window, and a film watched after the export that has since scrolled out of the ~50-entry feed exists in neither. Self-heals on the next export. Inherent to having no watchlist/history API.

**Files touched**
- `.github/workflows/deploy.yml` — `ref: main` on checkout
- `data/directors.json` — Wim Wenders
- Scheduled task `movie-app-refresh-check` — live-vs-repo comparison

---

### 2026-08-20 #13 — Nightly refresh was publishing nothing; VPN routing; three directors added

**Branch:** `main` · **Status:** shipped

**What changed**
- **The nightly job had never published.** It ran, succeeded, and committed — while the live site stayed frozen.
- **Worldwide availability.** A film not on his services in the US now shows one country where one of them does carry it, in pink. **888 films became reachable**, against 386 available at home.
- Added **Olivia Wilde** (3), **Xavier Dolan** (8) and **Justine Triet** (5).
- Filtered **71 unreleased IMDb announcements** out of the catalogue.
- Fixed four directors unreachable from the dropdown, a misleading director display, and a stale subscription list.

**Gotchas discovered** — five, and every one failed silently

- **A push made with the default `GITHUB_TOKEN` does not trigger other workflows.** GitHub blocks it to prevent recursion. So `daily-refresh` committed fresh data every night and `deploy.yml` never fired: green runs, updating repo, dead site, nothing wrong in any log. The repo held 172 seen / 650 missing RT / 1,851 posters while Pages served 171 / 1,387 / 951. **Any workflow that commits must publish its own commit.**
- **Hand-typed names drift from the data.** `directors.json` said "Alejandro G. Inarritu"; the films said "Iñárritu". The dropdown matched nothing, so 11 films looked absent — and the same for Kieślowski (13), Cuarón (12) and Forman (16). **52 films unreachable.** Names now come from `name.basics`, never from config. The first diagnostic regex, `/arritu/i`, also failed to match "Iñárritu" — the accent defeats it — which nearly confirmed the wrong conclusion.
- **`npm run data` silently discarded streaming data and RSS-synced films.** A full rebuild regenerates from source, and `build-data` reads the OMDb cache but not the provider caches. Streaming went to zero. The script now chains build → sync → providers.
- **A ranked fallback with no hard limit produces absurd answers.** The VPN picker offered "Netflix Angola" for *Shawshank*: no preferred country had it, so it took whatever sorted first. Restricted to 31 countries consumer VPNs actually serve. **A suggestion the user cannot act on is worse than none.**
- **A stored preference outlives the options it was chosen from.** Subscriptions saved during the French era could not contain Peacock, so 40 films rendered grey on a device set up too early. Pruning dead names was insufficient — a partly-valid set like `["Netflix"]` survived and stayed wrong. Fixed by versioning the storage key.

**Rejected**
- **The Streaming Availability API** — 100 requests/day means one pass over the library takes 23 days, longer than the data stays true.
- **Fetching one region at a time** — TMDB returns all 48 countries per call. The old code read one and discarded the rest, then fetched France separately for the same information. The worldwide feature cost **zero** extra API calls.
- **Listing every country a film is available in** — he asked for one solution; nine options is homework, not an answer.
- **Adding a single film on request** — his standing preference is the director's whole filmography. Recorded in `CLAUDE.md`.

**Files touched**
- `.github/workflows/daily-refresh.yml`, `deploy.yml` — publish job, `workflow_call`
- `scripts/enrich-tmdb.cjs`, `apply-providers.cjs` — worldwide fetch, VPN routing
- `scripts/build-data.cjs`, `enrich-omdb.cjs` — IMDb-sourced names, unreleased filter, `--only`
- `src/*` — pink badges, +N directors, versioned subscription key
- `data/regions.json`, `directors.json`

---

### 2026-08-19 #12 — Region switched to US; service list is subscriptions, not volume

**Branch:** `main` · **Status:** shipped

**What changed**
- Primary region **FR → US**. Nicolas watches from the United States; Canal+ is pulled from the FR data because he reaches it over a VPN. Region config lives in `data/regions.json`; each region has its own cache.
- **US coverage is far better: 1,444 films on a subscription service, against 885 for France.**
- The picker now lists **his five actual services** — Netflix (106), Disney+ (83), Amazon Prime Video (173), Peacock (40), Canal+ (56, tagged FR) — with the remaining 104 services grouped as **Others** (1,254 films).
- Subscriptions are seeded automatically on a device that has never been set up, so the app is useful on first open.
- Nightly job refreshes both regions.

**Why**
- He asked for "the 10 most represented services, and Others for the rest". Implemented literally, that list was **Kanopy (376), Criterion Channel (374), Hoopla (232), fuboTV (222), HBO Max (214), Philo (203), Prime (173), Fawesome (166), YouTube TV (140), Netflix (106)** — and **Peacock ranked 21st while Netflix barely scraped in and Disney+ fell into Others.**
- Library and arthouse services carry hundreds of older films, so volume ranking systematically favours services a person is least likely to pay for. **Film count is the wrong criterion for a subscription picker; "do you pay for it" is the right one.** Confirmed his five directly rather than guessing.

**Rejected**
- **Ranking purely by film count**, as literally requested — it buried two services he had explicitly told me he uses, in the same conversation. Followed the intent (a short, clean, relevant list) over the letter, and said so.
- **Pinning a few and filling the rest by count** — tried it; Netflix, Disney+, Hulu and Paramount+ still landed in Others behind Fawesome and Philo.
- **Listing all 109 services** — unusable.
- **Fetching only the US region** — would have dropped Canal+, the entire reason for the VPN.

**Gotchas discovered**
- **Peacock does not exist outside the US.** Verified against TMDB's region provider lists: US 292 providers including Peacock, FR 94 / GB 141 / DE 194 with none. Its European content is licensed to Sky and others. The service list is generated from the library, so a service can only appear if some film is actually on it — adding one by hand would create a checkbox matching zero films forever.
- **Tier suffixes must be stripped before the "Plus" rule, longest first.** "Peacock Premium Plus" survived as "Peacock Premium+" and counted as a separate service from "Peacock", because `(Premium|Basic|Standard)$` no longer matched once "Plus" became "+".
- **A per-region cache means every region must be refreshed, or one silently rots.** The nightly job originally refreshed one region; Canal+ would have frozen at today's snapshot while US data stayed current.

**Files touched**
- `data/regions.json` — new: primary region, VPN extras, listed services, default subscriptions
- `scripts/enrich-tmdb.cjs` — `--region`, per-region cache files
- `scripts/apply-providers.cjs` — multi-region merge, listed-services grouping
- `src/App.jsx`, `src/Subscriptions.jsx`, `src/styles.css` — default seeding, region tag
- `.github/workflows/daily-refresh.yml` — refreshes both regions

---

### 2026-08-19 #11 — Streaming availability: "what can I watch tonight"

**Branch:** `main` · **Status:** shipped

**What changed**
- French streaming availability per film, from TMDB (data sourced from JustWatch).
- An in-app **subscription picker** — 41 services, ordered by how many films each carries. Choices live in `localStorage`, so no code edit when a subscription changes.
- Cards badge services **you pay for** in green; others are muted; films on nothing link out to a where-to-watch page.
- New **On my services** filter, and the shuffle now says *"▶ Watch now on Canal+"*.
- Attribution footer for IMDb, OMDb, JustWatch and TMDB.

**Measured:** 2,205 of 2,254 films mapped to a TMDB id, 0 fetch errors. **885 films are on some subscription service, 770 of them unseen.** With Netflix + Disney+ + Canal+ selected: 325 films, or **205** when narrowed to the unseen top 1000.

**Why**
- Only `flatrate` (and `free`) is used. TMDB also returns rent and buy — *Shawshank* lists 13 rental options — which is noise, not information, when the question is "what can I watch on what I already pay for".
- The subscription list is a UI preference, not data. Baking it into a config file would mean a code change every time he drops a service.

**Rejected**
- **The Streaming Availability API** (accepts IMDb ids directly, so no TMDB needed): free tier is **100 requests/day**. At 2,254 films a single pass takes 23 days — longer than the data stays valid. Unusable at this size.
- **Scraping JustWatch** — against their terms, and fragile. Same answer as Google Images and the Letterboxd HTML.
- **Storing the watch link per film** — ~70 chars × 2,254 ≈ 160 KB for something derivable from the TMDB id, which is a small integer.
- **Storing provider names per film** — the same 41 names repeat thousands of times. Interned to a shared list and referenced by index.

**Gotchas discovered**
- **This is the first perishable data in the app, and it needs different plumbing.** IMDb runtimes and OMDb scores are correct forever, so those caches are permanent and never refetched. Streaming rights rotate constantly — a permanent cache would confidently show a film on Netflix months after it left. The provider cache therefore carries a timestamp per entry and expires after 7 days, and the UI states the date it was gathered. **The two caches are separate on purpose; do not merge them.**
- **TMDB lists billing routes, not services.** The raw feed has "Netflix" and "Netflix Standard with Ads" as separate providers, three Paramount variants, and an "… Amazon Channel" twin for almost everything. A picker built from raw names would ask Nicolas to tick Netflix twice. Collapsed to canonical names, which took 51 entries down to 41.
- **Careless regex mangled a brand.** Normalising `\s*\+\s*` to `+` turned "Cine+ OCS" into "Cine+OCS". Only strip spaces *before* the word "Plus"; leave an existing "+" alone.
- **Running daily against a 7-day expiry spreads the load** — about a seventh of the library refreshes each night rather than 2,200 calls in one burst.

**Files touched**
- `scripts/enrich-tmdb.cjs`, `scripts/apply-providers.cjs` — new
- `src/Subscriptions.jsx` — new
- `src/App.jsx`, `src/FilmCard.jsx`, `src/Filters.jsx`, `src/ShufflePanel.jsx`, `src/constants.js`, `src/styles.css`
- `.github/workflows/daily-refresh.yml` — provider refresh added, gated on the TMDB secret

---

### 2026-08-19 #10 — Letterboxd auto-sync for watched films; three collection tabs removed

**Branch:** `main` · **Status:** shipped

**What changed**
- `scripts/sync-letterboxd.cjs` reads the public RSS diary and marks newly-watched films as seen, carrying the rating across. Wired into the daily workflow.
- A watched film drops off **To watch** automatically — the tab is defined as `w && !s`, so setting `seen` is sufficient. No separate removal step.
- Films watched that are not in the catalogue are **added** with whatever the feed provides; runtime, genres and director stay null until the next full `npm run data`.
- Removed the Directors, Bong Joon Ho and Nouvelle Vague tabs. No films removed — 2,253 still present, reachable from All films and the director dropdown.
- `refresh-scores.yml` became `daily-refresh.yml`: Letterboxd sync, then OMDb scores.

**Why**
- The watchlist genuinely cannot be automated. Letterboxd publishes a **diary** feed but no **watchlist** feed, and their HTML returns 403 to automated clients. Watchlist changes still require a CSV export — worth stating plainly rather than implying full automation.
- The sync runs before the key check and does not depend on it, so a missing OMDb secret degrades to "no scores today" instead of blocking the watched-list update.

**Rejected**
- **Matching feed entries on TMDB id.** The feed carries one, but the dataset is keyed by IMDb id and nothing maps between them offline. Title+year with the existing vote-weighted resolution is the practical join.
- **Skipping films that are not in the catalogue.** Silently ignoring a film the user just watched is the worst outcome; adding a sparse record that fills in later is honest and visible.
- **Treating an empty feed as authoritative.** It now short-circuits — an empty response means "nothing to report", never "unwatch everything". Same principle as the upsert rule.

**Gotchas discovered**
- **Letterboxd RSS carries HTML entities, and normalising without decoding creates duplicates.** `Don&#039;t Look Up` normalises to `don039tlookup` — the entity's digits survive the alphanumeric filter — so it failed to match its own record and was queued as a new film. Caught only because a dry run listed two additions where one was obviously already in the library. Decode entities before any normalisation.
- **Removing the collection tabs exposed a director-matching bug they had been masking.** The dropdown matched the *display* string, capped at two names for card legibility, so any third-billed director was unfindable: it reported 10 Bong Joon Ho films where the tab had shown 12. **99 films have 3+ credited directors.** Films now carry `da`, the full credit list, used for filtering and search only.
- **A script that adds records must recompute every derived count, not just the obvious ones.** The sync updated `all`, `seen` and `watchlist` but left `withPoster` stale, so the header under-reported by two. Recompute the whole block.

**Files touched**
- `scripts/sync-letterboxd.cjs` — new
- `scripts/build-data.cjs`, `src/App.jsx` — full director credits for matching
- `src/constants.js` — five tabs
- `.github/workflows/daily-refresh.yml` — replaces `refresh-scores.yml`

---

### 2026-08-19 #9 — Shipped: Vite + React app live on GitHub Pages

**Branch:** `main` · **Status:** deployed and verified at https://nicolassporrer-cmd.github.io/Movie-App/

**What changed**
- Replaced the generated mockup with a real React app: tabs, search, six filters, six sorts, shuffle, removal with undo.
- `scripts/build-data.cjs` emits `public/data/films.json` — 2,253 films, 536 KB (~150 KB gzipped).
- PWA manifest and PNG icons, so Add to Home Screen gives a real icon and a fullscreen launch.
- GitHub Actions builds and deploys on push. Live ~30 seconds after the first push.
- `CLAUDE.md` filled in: real stack, data model, deploy path, refresh commands.

**Why**
- Incremental rendering (90 cards per batch via `IntersectionObserver`) because 2,253 cards at once is slow on a phone.
- The deploy workflow asserts `dist/data/films.json` is non-empty, so a broken pipeline fails the build instead of publishing an empty app.

**Rejected**
- **Generating the dataset inside CI.** It needs ~500 MB of IMDb downloads per run; committing the JSON keeps deploys fast and reviewable, and the data changes far less often than the code.
- **A virtualised list library.** Batched rendering with an observer is a few lines and no dependency.
- **Keeping the mockup HTML alongside the app.** Two things claiming to be the product is exactly how the stale-copy confusion started.

**Gotchas discovered**
- **`"type": "module"` breaks every CommonJS script in the repo.** Vite requires it in `package.json`; the moment it was added, all five pipeline scripts died with *"require is not defined in ES module scope"*. Renamed to `.cjs`. Anything new in `scripts/` must use that extension.
- **A film missing an OMDb score is not necessarily a bug.** *The Godfather* and *The Dark Knight* showed `RT —` at the top of the list, which looked like a data fault. They are films Nicolas has **seen**, so `--unseen-first` correctly deprioritised them past 1,890 unseen films. Verified against `watched.csv` before assuming a defect.
- **Vite's `base` must match the Pages project path.** A project site serves from `/Movie-App/`, so `base: '/Movie-App/'` and `import.meta.env.BASE_URL` for the fetch. Without it every asset 404s on a site that looks correctly built.

**Verification**
Against the live host, not the dev server: all assets HTTP 200, no console errors, 0 broken posters, tab counts correct, search "hitchcock" 56, RT ≥ 95 gives 239, shuffle respects filters, removal persists and undo clears it. At 375×812: no horizontal scroll, 2 cards per row, nothing overflowing.

**Files touched**
- `src/*`, `index.html`, `vite.config.js`, `package.json` — the app
- `scripts/build-data.cjs`, `scripts/make-icons.cjs` — new
- `.github/workflows/deploy.yml` — new
- `CLAUDE.md` — filled in from the template
- `mockup-browse.html`, `movie-app-v6.html` — deleted, superseded

---

### 2026-08-19 #8 — Director list reshaped: 5 removed, 12 added

**Branch:** n/a · **Status:** database updated, verified

**What changed**
- Removed from the curated list: Rajkumar Hirani, Upendra, Mrinal Sen, Mani Ratnam, Bimal Roy. **106 films dropped** from the catalogue.
- Added: M. Night Shyamalan, Alfred Hitchcock, Sidney Lumet, Ingmar Bergman, Orson Welles, Brian De Palma, Clint Eastwood, Greta Gerwig, Hayao Miyazaki, Woody Allen, Terrence Malick, Lars von Trier. **360 films added.**
- `data/top50-directors.json` → `data/directors.json` (57 entries, each tagged `imdb-top50` or `added`). The tab is now "Directors" — after the edits it is no longer the IMDb top 50 and the label would have been a lie.
- New `data/excluded-directors.json`.
- Library: 2,059 → **2,253 films**. Directors tab: 793 → 1,045.

**Why**
- Exclusion is applied at catalogue level rather than by hiding at render time, so excluded directors cannot leak in through the top-1000 pool.

**Rejected**
- **Excluding films the user has already watched or shortlisted.** Removing a director must never erase their own history, so `seen` and `watchlist` entries are re-added after the exclusion pass regardless of who directed them. A catalogue filter is not a record filter.
- **Leaving the tab labelled "Top-50 directors"** — with 5 removed and 12 added it is a 57-name curated list, and keeping the old label would misdescribe it.

**Gotchas discovered**
- **IMDb's `primaryProfession` is not a reliable test of what someone does.** Hayao Miyazaki lists as `animation_department,writer,art_department` — no "director" at all — yet `title.crew` correctly credits him as director on 15 films. `primaryProfession` is a top-3 summary, so use it only to disambiguate same-name people, never to decide whether someone qualifies as a director. Filtering candidates on it would have silently dropped him.
- **Removing an entity from a curated list does not remove its items from other collections.** A film by an excluded director can still qualify for the top-1000 pool on its own merits. Exclusion has to be applied when the store is built, not when a tab is rendered.

**Files touched**
- `data/directors.json` — new, replaces `top50-directors.json`
- `data/excluded-directors.json` — new
- `scripts/build-mockup.js` — catalogue-level exclusion, renamed tab

---

### 2026-08-19 #7 — Title+year collisions attached wrong directors; build stamp added

**Branch:** n/a · **Status:** fixed and verified

**What changed**
- Letterboxd films now resolve to the **most-voted** IMDb title when several share a title and year, instead of whichever the dataset stream happened to reach first.
- Every page carries a visible **build stamp** (`Build v5 — YYYY-MM-DD HH:MM`) with a line telling the reader to check for a stale copy if it does not match.

**Why**
- Reported as "the director names are wrong". A spot-check against 20 films where the correct answer is known found 19 right and one wrong: *The Big Blue* (1988) showed **Andrew Horn** rather than Luc Besson.
- The cause: `title+year` is not unique. The index kept the first film seen for each key, and stream order is arbitrary. **13,464 title+year keys in IMDb's movie set map to more than one film.** Now 30 of 30 spot-checked directors are correct.

**Rejected**
- **Matching on title alone** — strictly worse; year at least narrows the field.
- **A manual override file as the primary fix** — still needed for genuine ambiguity, but it should not be carrying an error this systematic. Picking the most-voted title fixes the general case; overrides handle the residue.
- **Reporting collisions and stopping** — 13,464 keys is far too many to review by hand, and the vote heuristic resolves virtually all of them correctly.

**Gotchas discovered**
- **`title+year` is not a unique key for films, by a wide margin.** 13,464 collisions across 754,554 movies. First-match-wins produces confidently wrong metadata with no error and no warning — the card renders perfectly, just describing a different film. Resolve toward the most-voted candidate: when a person types a title, they mean the famous one.
- **Regenerating a file under the same name makes stale copies indistinguishable.** Each rebuild was delivered as `mockup-browse.html`, so the reader's Downloads folder accumulated `mockup-browse (1).html`, `(2)`, and so on — and the complaint "I don't see the All films view" almost certainly came from an older build that predated the tab. Every generated artifact should carry a visible build stamp, and each delivery should use a distinct filename.

**Files touched**
- `scripts/build-mockup.js` — vote-weighted collision resolution, collision count logged, build stamp
- `mockup-browse.html` — rebuilt as v5

---

### 2026-08-19 #6 — OMDb enrichment: RT, Metacritic and posters from one key

**Branch:** n/a · **Status:** enrichment running

**What changed**
- `scripts/enrich-omdb.js` fetches Rotten Tomatoes, Metacritic, IMDb and a poster URL per film. Idempotent, cached per `imdbId`, with `--probe`, `--dry-run`, `--limit` and `--unseen-first`.
- Build now reads `data/omdb-cache.json` and renders real RT and Metacritic scores, real posters, plus an RT filter and RT sort.
- `data/films.json` emitted by the build as the enrichment input.

**Why**
- **TMDB turned out to be unnecessary.** OMDb's standard response includes a `Poster` URL on `m.media-amazon.com`, verified to return HTTP 200 and hotlink cleanly. One key covers scores *and* posters, so the second signup — which the user was struggling with — was dropped entirely.

**Rejected**
- **Scraping Google Images for posters** (user's suggestion). Against Google's terms, actively blocked by CAPTCHA within a few dozen requests, hotlink-protected and rotting URLs, and — decisively — image search returns whatever ranks, not verifiably the right film. Across ~2,000 films that means an unknown number of silently wrong posters with no way to detect them. It would also hotlink copyrighted images from arbitrary hosts.
- **Signing up for TMDB anyway** — settled by a one-call probe before spending the user's time on a second account.
- **Preferring Letterboxd RSS posters over OMDb's** — RSS covers ~50 films, OMDb covers the whole library.

**Gotchas discovered**
- **OMDb's docs do not answer whether free responses include a poster.** They state only that the separate poster API (`img.omdbapi.com`) is patron-only, and say nothing about the `Poster` field in normal responses. Two searches and a docs fetch left it ambiguous; one API call settled it. When docs are silent about a field, probe rather than assume — and build the probe as a flag on the real script so it exercises the same code path that will run in production.
- **`.env` can silently exist as a directory.** The user's key was never readable because something had created `.env` as a folder, with an abandoned `.crdownload` inside. `[ -f .env ]` failed while `ls` still showed `.env`, which reads as "the file is there" at a glance. Any script reading config should check it is a *file*, not merely that the path exists.

**Files touched**
- `scripts/enrich-omdb.js` — new
- `scripts/build-mockup.js` — reads the OMDb cache; RT/Metacritic rendering, RT filter and sort
- `data/films.json` — new build output

---

### 2026-08-19 #5 — Manual film removal, as an exclusion list

**Branch:** n/a (planning) · **Status:** mockup v4 built and verified

**What changed**
- Hovering a film card reveals a **×** button that removes it from the database view.
- Removals go to a **Removed** tab where each card carries a **Restore** button.
- An undo toast appears for six seconds after every removal or restore.
- All tab counts recompute live; the shuffle never picks an excluded film.
- Exclusions persist in `localStorage` under `movieapp.excluded.v1`, keyed by IMDb id.

**Why**
- **Removal must never be a delete.** The database is *regenerated* from the IMDb datasets on every build, so a deleted row would silently reappear on the next refresh — the user would remove the same film repeatedly and conclude the feature was broken. An exclusion list keyed by film id survives any rebuild, which is the only shape that actually works here.
- This is also the project's own rule (`CLAUDE.md`: upsert, never overwrite; absent data is a no-op, never a deletion) arriving at the same answer from the data-integrity side.

**Rejected**
- **Actually deleting the row from the store** — undone by the next build. See above.
- **A hard delete with a confirmation dialog** — a modal on every removal makes bulk cleanup miserable, and it still would not survive a rebuild. Undo-after-the-fact is both cheaper to use and safer.
- **Excluding by title+year** — three Letterboxd rows never resolved to an IMDb id, and alternate cuts share titles. IMDb id is the stable key; unresolved rows fall back to their `lb:` key.
- **Hiding removed films entirely** — a removal with no way to review or reverse it is a black hole. The Removed tab makes the exclusion list inspectable, which matters when it is the thing that persists.

**Gotchas discovered**
- **`[].slice.call(aSet)` returns an empty array.** A `Set` is not array-like — it has no `length` — so the persistence call wrote `[]` on every removal. The UI looked perfect: counts updated, the card greyed out, undo worked. Only a reload revealed that nothing had ever been saved. Use `Array.from(set)` or spread. This class of bug is invisible to UI testing and only shows up if you explicitly assert on what was *stored*, then reload.
- **Tab counts baked in at build time go stale the moment anything is removable.** They were rendered server-side into the tab labels. Any feature that changes membership at runtime forces them to be computed client-side on every filter pass.

**Files touched**
- `scripts/build-mockup.js` — removal, restore, undo toast, live tab counts, exclusion-aware shuffle
- `mockup-browse.html` — v4 regenerated

---

### 2026-08-19 #4 — Collections (Bong Joon Ho, Nouvelle Vague) and the All-films view

**Branch:** n/a (planning) · **Status:** mockup v4 built

**What changed**
- **Store restructured.** Previously each tab built its own row list, so a film in two collections was emitted twice. Now there is a single `films` Map keyed by `tconst`, and tabs are *views* over it. Verified: 2,060 cards, **0 duplicate title+year pairs**.
- **All films** tab — the whole database, deduplicated, with badges showing which collections each film belongs to.
- **Bong Joon Ho** — 12 features.
- **Nouvelle Vague** — 341 films by 15 directors, 147 inside the 1958–1973 core period.
- Collections moved into `data/collections.json`, editable without touching build code.

**Why**
- The All view only means anything if a film appears exactly once. That forced the dedup fix, which was a latent bug the tab-scoped lists had been hiding.
- Collection membership is editorial, so it belongs in data, not in code.

**Rejected**
- **Restricting Nouvelle Vague to the 1958–1973 window.** Would have dropped later Godard, Varda and Malle from the database entirely, contradicting "all the movies". Instead everything by those directors is included and the core period is a badge.
- **Inferring the movement from IMDb genres or keywords.** There is no movement field; genre/country/year heuristics pull in unrelated French cinema and miss the Left Bank documentaries. A named director list is the only defensible definition.
- **Guessing director IDs from memory.** Looked every one up in `name.basics` instead — which surfaced three decoy records (an actor named Alexandre Astruc, a camera operator named Claude Chabrol, another Chris Marker). Picking by name alone would have silently attached the wrong filmography.

**Gotchas discovered**
- **IMDb spells it "Bong Joon Ho", not "Bong Joon-ho".** The hyphenated form matches nothing. Any name lookup against `name.basics` needs the exact IMDb spelling, so look names up and confirm against birth year and profession rather than trusting a remembered form.
- **Common names collide in `name.basics`.** Three of the sixteen directors searched returned a second person with the same name and no directing credits. Always disambiguate on `primaryProfession` plus `birthYear`.
- **"Nouvelle Vague" is a critical label, not a fact.** No dataset encodes it, so membership is a stated editorial choice. It is written down in `data/collections.json` with its rationale so the boundary is visible and arguable rather than hidden in code.

**Files touched**
- `data/collections.json` — new: Bong Joon Ho and the 15 Nouvelle Vague directors, with the period definition and its reasoning
- `scripts/build-mockup.js` — rewritten around one deduplicated store; tabs became views
- `mockup-browse.html` — v4, seven tabs, 2,060 unique films

---

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
