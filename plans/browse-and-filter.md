# Plan — Browse & Filter

**Status:** awaiting agreement · **Date:** 2026-08-19

## Goal

One view over every film, answering two questions:
1. **Seen** — what have I watched, how did I rate it, how did my friends rate it?
2. **To watch** — what should I watch next, filtered by genre, IMDb/RT score, runtime, director, year?

## Findings that shape the design

Investigated before planning; each one changed a decision.

**F1 — Letterboxd has no usable API.** Request-only, no guaranteed access. Not a dependency.

**F2 — Letterboxd serves RSS to bots but 403s its HTML pages.** RSS is the only automated door. Scraping is out: against ToS and technically blocked.

**F3 — RSS is a rolling ~50-entry window, not history.** Measured: `nico_spo` 50 items, `Regelegorila` 85 items of which only 50 carry a rating. It does not backfill.

**F4 — Friend coverage via RSS alone is far too thin to carry the headline feature.** Measured overlap against the 170 watched films:

| Friend | Feed items | Rated | Overlap with your watched |
|---|---|---|---|
| `Regelegorila` | 85 | 50 | **7** |
| `thiboudon` | 0 | 0 | **0** |

Seven films out of 170. "See my friends' grades on films I've seen" does not work on RSS. **Friends' CSV exports are the primary source; RSS is the incremental top-up.** This inverts the earlier assumption and is the single most important decision in this plan.

**F5 — `thiboudon`'s feed is completely empty.** Zero items. Either a new/inactive account, a private one, or a wrong username. Needs confirming before building around it.

**F6 — The two sources carry different keys.**

| Source | Key available | Coverage |
|---|---|---|
| CSV export | `boxd.it` short URI + Name + Year | full history |
| RSS | `tmdb:movieId` + Name + Year | recent ~50 |

CSV has no TMDB id, so CSV-only films must be resolved by title+year — which mis-hits on remakes and re-releases. RSS entries carry the real id and auto-correct the map. Resolution is cached per film, not per import.

**F7 — Ratings skew high and cluster.** 60 films at 4★, 39 at 4.5★, 21 at 5★; only 6 below 2.5★. A 1–5 filter is near useless — most of the library sits in one band. Sort and filter must lean on *external* scores (IMDb/RT) and on friend deltas, not on your own rating.

## Data model

One `films` store, keyed by **TMDB id** where known, `boxd.it` URI otherwise. `film-map.json` holds the `boxd.it → tmdb` resolution with a manual override file for mis-hits.

```
film:  tmdbId · boxdUri · title · year · genres[] · runtime · director
       imdbRating · rtScore · posterUrl
views: { nico_spo: {rating, liked, watchedDate, rewatch},
         Regelegorila: {...}, thiboudon: {...} }
status: watched | watchlist | unseen
```

Every import upserts by key. An absent source is a no-op, never a deletion — so re-importing one friend's CSV never touches another's data.

## Sources

| Source | Gives | Cost |
|---|---|---|
| Letterboxd CSV | full watched/ratings/watchlist history | manual, per person |
| Letterboxd RSS | recent activity + TMDB id | free, automatic |
| TMDB | genre, runtime, director, year, poster | free key |
| OMDb | IMDb + Rotten Tomatoes + Metacritic in one call | free key, 1000/day |

OMDb's 1000/day cap against ~200 films means a full enrich is one day's budget; the cache makes it a one-time cost.

## Screen

Single page, two tabs — **Seen** and **To Watch** — sharing one filter bar.

Filters: genre · IMDb score · RT score · runtime · director · year · friend-rated-only
Sort: friend rating, IMDb, RT, runtime, year, your rating

Film card: poster · title · year · runtime · director · genre chips · your rating · **friends' ratings** · IMDb + RT badges

## States to agree

1. **Happy path** — full library, all metadata present
2. **Empty** — no CSV imported yet
3. **Loading** — enrichment in progress
4. **Partial metadata** — film resolved but IMDb/RT missing (expected for obscure and 2026 titles)
5. **No friend data** — the common case today: 163 of 170 films have no friend rating
6. **Unresolved film** — title+year matched nothing on TMDB; needs manual override

State 5 is the one that decides whether this app feels good or empty on day one.

## Open questions

1. Will `Regelegorila` and `thiboudon` send CSV exports? Without them the friends feature covers 7 films.
2. Is `thiboudon` the correct username?
3. Hosting: static site + GitHub Pages, data refreshed by a scheduled job committing JSON to the repo. Confirm.

## Not in scope

Writing back to Letterboxd · recommendations · social feed · mobile app.
