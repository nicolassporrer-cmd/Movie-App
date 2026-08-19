# Movie-App — Backlog

Items ordered by priority. Status lifecycle: `unplanned` → `planned` → `in_progress` → done.

---

## In progress

*(none)*

---

## Planned

| # | Item | Notes |
|---|------|-------|
| 1 | Finish OMDb enrichment | Automated: `.github/workflows/refresh-scores.yml` runs daily at 06:17 UTC. 1,386 films still without RT; clears in ~2 runs. Needs the `OMDB_API_KEY` repo secret. |

---

## Unplanned

| # | Item | Notes |
|---|------|-------|
| 2 | Watchlist auto-sync | Not possible from Letterboxd — they publish a diary feed but no watchlist feed, and their HTML 403s bots. Needs a fresh CSV export whenever the watchlist changes. |
| 7 | Cross-device sync for removals | Currently `localStorage`, so per-device. Options: commit an exclusions file (synced but read-only on device), or add a small backend. |
| 3 | Automated catalogue refresh | Scores now refresh daily. The *catalogue* (new IMDb films, new Letterboxd exports) still needs a local `npm run data`, since it pulls ~500 MB of datasets. |
| 4 | Friends' ratings | Parked at your request. Needs CSV exports from Regelegorila and thiboudon; RSS alone covers 6 of 170 films. |
| 5 | Manual override file for title matches | For films where title+year resolves to the wrong IMDb entry. The vote-weighted heuristic handles the general case. |
| 6 | Private hosting | Only if the public URL becomes a concern — Pages sites are always public. |

---

## Done

| # | Item | Shipped |
|---|------|---------|
| — | Browse and filter over the Letterboxd export | 2026-08-19 |
| — | Discover: unseen films from the IMDb top 1000 | 2026-08-19 |
| — | Shuffle button, respecting active filters | 2026-08-19 |
| — | Manual removal as an exclusion list, with undo and restore | 2026-08-19 |
| — | Collections: 57 directors, Bong Joon Ho, Nouvelle Vague | 2026-08-19 |
| — | All-films view over one deduplicated store | 2026-08-19 |
| — | OMDb enrichment: Rotten Tomatoes, Metacritic, posters | 2026-08-19 |
| — | React app deployed to GitHub Pages with PWA support | 2026-08-19 |
