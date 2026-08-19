# Plan — Discover (top 500) & Shuffle

**Status:** awaiting agreement · **Date:** 2026-08-19 · **Supersedes nothing; extends** `browse-and-filter.md`

## Goal

1. **Discover** — seed the app with a real catalogue of great films beyond the 207 in the Letterboxd export, and flag everything not yet seen.
2. **Shuffle** — one button that picks a film when you cannot decide.

## Findings

**F8 — IMDb publishes official datasets. This is the source.**
`datasets.imdbws.com` serves `title.ratings.tsv.gz` (8.6 MB) and `title.basics.tsv.gz` (226 MB), refreshed daily. Free, official, non-commercial licence. No scraping, no API key. 1,707,061 rated titles.

**F9 — Ranking IMDb naively returns television, not film.**
The unfiltered top of the ratings file is *Game of Thrones* episodes (`tt4283088`, `tt2178784` — 9.9). Episodes are rated by people who already love the series, so they sit far above any feature film. `title.basics` must filter to `titleType === 'movie'`, which also drops shorts, TV movies and video releases. Without this the "top 500" is ~all television. **This is the single trap in the feature.**

**F10 — The vote threshold is a product decision, not a technical one.** Measured:

| Min votes | Pool | Top-500 score floor | Effect |
|---|---|---|---|
| 25,000 | 7,253 | 8.0 | Regional hits break the top 10 — *The Chaos Class* (TR, 46k votes) outranks *LOTR* |
| **50,000** | **4,641** | **7.9** | **Outliers gone, pool still broad** |
| 100,000 | 2,745 | 7.7 | Safe but narrower |
| 250,000 | 1,044 | 7.4 | Pool collapses; top 500 is half of it, so quality *falls* |

**Chosen: 50,000.** Highest threshold that removes the skew without shrinking the pool enough to hurt selectivity.

**F11 — A genuine "Rotten Tomatoes top 500" cannot be built.**
RT has no public API. Access is enterprise, from **$60,000/year**. RT scores are obtainable only per film via OMDb, capped at 1,000/day. So an RT ranking is necessarily *derived*: rank the IMDb pool by the RT scores we fetched. It is "the best-reviewed of the 4,641 films we checked", not RT's own list — films outside the pool are invisible to it. **Say this in the UI; do not label it "RT Top 500".**

**F12 — Cross-referencing works, at 50k votes.** Of the IMDb top 500: **77 seen, 423 unseen, 20 already on the watchlist.** Matching is title-normalised (lowercase, alphanumeric only) against both primary and original title.

**F13 — Title matching has known failure modes.** *Kill Bill: The Whole Bloody Affair* does not match the logged *Kill Bill: Vol. 1* — correctly, it is a different cut, but the class of problem (alternate cuts, re-releases, translated titles) will produce both false "unseen" and false "seen". Needs the manual override file from `browse-and-filter.md`, plus a review queue for near-misses.

## Design — Discover

Third tab: **Discover**, the IMDb top 500 minus everything seen. Shares the existing filter bar. Cards already on the watchlist carry a flag.

Metadata comes free from `title.basics`: **year, runtime, genres, IMDb score, vote count** — real, no API needed. Still missing on this tab: **director, poster, RT**. Director and poster come from TMDB (one call per film, cached); RT from OMDb.

Enrichment budget: 423 unseen films against OMDb's 1,000/day is a single day. Cached permanently after.

## Design — Shuffle

A **Pick one for me** button next to the filters.

- Picks from the **currently filtered, currently visible** set. Filters are the point: "a comedy under 100 minutes I haven't seen" is the real use case; ignoring filters makes the button useless.
- Opens a panel: poster, title, year, runtime, director, genres, scores, and the count it chose from ("picked from 87 films matching your filters").
- **Roll again** re-picks without closing. Escape or click-outside closes.
- Empty state: if filters match nothing, say so and prompt to widen rather than showing a blank panel.

### Note on the "deterministic values, never random" rule

`CLAUDE.md` forbids `Math.random()`. That rule protects values *derived from data* — colours, IDs, sort keys — which must be stable across renders. A dice roll is the opposite: user-triggered, expected to differ every press. **This is the one sanctioned use of randomness in the app.** It must stay inside the shuffle handler and never leak into ordering, colour or key assignment.

Open question: should a roll be reproducible (seed in the URL, so a pick can be shared)? Not needed for v1.

## Data model additions

```
film.source:     letterboxd | imdb-top500 | both
film.imdbVotes:  number
film.seen:       derived — is it in the watched set
film.matchConf:  exact | normalised | none   (drives the review queue)
```

Upsert by key as before. A film in both the export and the top 500 is one record with `source: both`, never two rows.

## States to agree

1. **Discover, happy path** — 423 cards, real IMDb metadata
2. **Discover, pre-enrichment** — no posters or RT yet; must not look broken
3. **Shuffle, normal** — panel with a pick
4. **Shuffle, no matches** — filters exclude everything
5. **Shuffle, sparse metadata** — picked film has no poster
6. **Refresh** — dataset re-pulled, new films enter the top 500, previously unseen films now seen

## Open questions

1. Vote threshold — 50,000 confirmed?
2. Should Discover be top 500, or the full 4,641-film pool with 500 as a default filter?
3. Should shuffle be able to pick films already seen (for a rewatch), or unseen only?
4. Refresh cadence for the IMDb dataset — weekly is plenty; it moves slowly.
