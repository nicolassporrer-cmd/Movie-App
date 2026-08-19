# Movie-App — Backlog

Items ordered by priority. Status lifecycle: `unplanned` → `planned` → `in_progress` → done.

---

## In progress

*(none)*

---

## Planned

| # | Item | Notes |
|---|------|-------|
| 1 | Finish OMDb enrichment | 1,157 films remain, including most of the watched list. `node scripts/enrich-omdb.cjs --limit 900` then `npm run data`. Free tier is 1000/day. |

---

## Unplanned

| # | Item | Notes |
|---|------|-------|
| 2 | Cross-device sync for removals | Currently `localStorage`, so per-device. Options: commit an exclusions file (synced but read-only on device), or add a small backend. |
| 3 | Weekly automated data refresh | GitHub Action re-pulling the IMDb datasets. Needs `OMDB_API_KEY` as a repo secret. Deferred until the manual path has run a few times. |
| 4 | Friends' ratings | Parked. Needs CSV exports from Regelegorila and thiboudon; RSS alone covers 6 of 170 films. |
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
