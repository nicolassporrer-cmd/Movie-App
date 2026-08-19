# Movie-App — Project Context

## What this is
A personal film browser: what Nicolas has watched and rated on Letterboxd, plus a curated catalogue of films he has not seen — filterable by genre, IMDb and Rotten Tomatoes score, runtime, director and year, with a shuffle button for when nothing appeals.

Built on:
- **Data layer** — static JSON generated at build time. No database, no server, no API at runtime.
- **Pipeline** — Node scripts over IMDb's official datasets, the Letterboxd CSV export, friend RSS feeds, and an OMDb response cache
- **Frontend** — React 18 + Vite, plain CSS, no UI framework
- **Hosting** — GitHub Pages, deployed by GitHub Actions on push to `main`

**Deployment URL:** https://nicolassporrer-cmd.github.io/Movie-App/

**Library:** 2,253 films. Letterboxd account `nico_spo` — 170 watched, 37 on the watchlist.

---

## Working with Nicolas

- Keep responses concise — no verbose narration of what was just done
- **Verify claims against real data before reporting them.** Several past errors — fabricated metadata, wrong directors, silently empty persistence — looked perfect in the UI and were only caught by asserting on actual values and reloading.
- **Never render a value that was not sourced.** Unknown means an explicit dash, never a plausible-looking placeholder.
- QA checklists after deploying must be **numbered prescriptive steps organized by Part** (Part 1: Feature works, Part 2: Data layer, Part 3: Edge cases, Part 4: Regressions) — never bullet circles

---

## Files in this repo

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — project bible |
| `BACKLOG.md` | Prioritized feature backlog |
| `JOURNAL.md` | Append-only build log — why the app is the way it is (rebuild spec) |
| `.claude/commands/plan.md` | `/plan` slash command |
| `.claude/commands/feature.md` | `/feature` slash command |
| `.claude/commands/qa.md` | `/qa` slash command |
| `.claude/commands/sync.md` | `/sync` slash command |
| `.claude/commands/improve-prompt.md` | `/improve-prompt` slash command |
| `plans/` | Agreed design per feature — tracked, part of the rebuild spec |
| `src/App.jsx` | State, filtering, sorting, removal, incremental rendering |
| `src/constants.js` | Tabs, sorts, tunables, `inTab()` — the single definition of tab membership |
| `src/FilmCard.jsx` `src/Filters.jsx` `src/ShufflePanel.jsx` | Components (module level — never nested in a render) |
| `src/styles.css` | All styling; theme tokens at the top |
| `scripts/build-data.cjs` | Builds `public/data/films.json` from every source |
| `scripts/enrich-omdb.cjs` | Fetches RT / Metacritic / posters. `--probe`, `--dry-run`, `--limit`, `--unseen-first` |
| `scripts/make-icons.cjs` | Generates the PWA PNGs and manifest, no image dependency |
| `scripts/serve.cjs` | Local static server for checking a build |
| `data/*.json` | Curation and caches — see Data layer |
| `.github/workflows/deploy.yml` | Build and publish to Pages on push to `main` |

**Scripts are `.cjs`, not `.js`** — `package.json` needs `"type": "module"` for Vite, which breaks `require` in any `.js` file.

---

## Development workflow

**Design before building** — complete all requirements discussion and get explicit agreement before writing any files. This includes tooling and workflow changes.

**Mockup first** — if UI changes are involved, use the Preview tool during `/plan` to render mockups. Iterate until all states (default, loading, empty, error, edge cases) are agreed before writing code. Iterate on the mock many times; deploy once for QA sign-off.

**Lifecycle:** `/plan` → `/feature` → `/qa` → `/sync`

- `/feature` automatically calls `/qa` after deploying — do not skip
- `/sync` is the session closer: commits, pushes, updates docs. Run after any session that touched tracked files

**Branch rules:**
- Feature work: create `feature/<slug>` before any changes; never work directly on `main`
- Config/doc updates (CLAUDE.md, BACKLOG.md, etc.): work directly on `main`
- After QA passes: `/sync` merges to `main`, pushes, deletes the branch
- Merge conflict: stop, explain what's conflicting, show both versions, ask how to resolve

---

## Building conventions

1. **No gold-plating.** Don't add features, refactor, or introduce abstractions beyond what the task requires. Three similar lines beats a premature abstraction.
2. **No unnecessary error handling.** Only validate at system boundaries (user input, external APIs). Trust internal code and framework guarantees.
3. **No explanatory comments.** Only add a comment when the *why* is non-obvious — a hidden constraint, a subtle invariant, a platform workaround. Well-named identifiers are self-documenting.
4. **Extend, never replace.** New fields, columns, and endpoints must be additive. Never remove or rename something that existing data or callers depend on.
5. **Normalize at the boundary.** Convert external data (API responses, Sheet values, file contents) to your internal format at the point of entry. Downstream code never deals with the source format.
6. **Optimistic update + undo.** For write actions, update the UI immediately. Keep the item visible in a faded/muted state until the write confirms. Provide an undo path.
7. **Graceful degradation.** Missing data renders a sensible empty/default state, not a broken component. Check before accessing; never assume a field exists.
8. **No hardcoded credentials.** Secrets go in `.env` (gitignored), environment variables, or a secrets manager. Never commit them.
9. **Abstract platform constraints.** Work around platform limitations in one place and document the reason in Known Gotchas — don't scatter workarounds across the codebase.

---

## Data integrity rules

1. **Upsert, never overwrite.** All writes use upsert-by-key: add new rows, update existing rows in-place, delete only rows whose keys are explicitly absent from the incoming data. Never clear and rewrite a collection unconditionally.
2. **Empty array = no-op.** Sending `[]` for a list field must leave all existing rows untouched. Only a non-empty array triggers the upsert.
3. **Blank payload value ≠ clear.** Blank or missing fields in an incoming payload must never overwrite existing non-blank values in the data store.
4. **Idempotent writes.** Running the same import twice produces the same result. Server-side dedup (by natural key) prevents duplicates without error — a re-run is always safe.
5. **Flag-and-skip deduplication.** Items that look like duplicates get a `possible_duplicate: true` flag and are skipped at import time — not silently dropped. The import summary lists all skipped items.
6. **Dry-run on destructive scripts.** Any script that deletes rows, clears a collection, or rewrites data in bulk must support a `--dry-run` flag that previews changes without committing them.

---

## Deployment

Deployment is automatic: **push to `main` and `.github/workflows/deploy.yml` builds and publishes to GitHub Pages.** Typically live in about 30 seconds. There is no manual deploy step.

The workflow runs `npm ci`, `npm run build`, then asserts `dist/data/films.json` is non-empty and fails loudly rather than shipping an empty app.

After deploying, tell Nicolas to hard-refresh (Ctrl+Shift+R, or pull-to-refresh on the phone) — the hashed asset filenames change but `index.html` can be cached.

**One-time setup already done:** Pages source is set to *GitHub Actions* in repo settings.

### Refreshing the data

Node is installed but **not on PATH for spawned shells** — use the absolute path or export it first.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd /c/dev/Movie-App
node scripts/enrich-omdb.cjs --limit 900     # OMDb free tier is 1000/day
npm run data                                  # regenerate public/data/films.json
git add -A && git commit -m "Refresh film data" && git push
```

---

## Data layer

Everything is one generated file: **`public/data/films.json`** (~536 KB, ~150 KB gzipped), built by `scripts/build-data.cjs`.

**Sources**

| Source | Provides | Notes |
|---|---|---|
| `title.basics.tsv.gz` | title, year, runtime, genres | 226 MB — must be **streamed**, never read into memory |
| `title.ratings.tsv.gz` | IMDb score, vote count | includes TV; filter `titleType === 'movie'` |
| `title.crew.tsv.gz` | director ids | |
| `name.basics.tsv.gz` | director names | |
| Letterboxd CSV export | watched, ratings, watchlist | no TMDB id, only a `boxd.it` URI |
| Letterboxd RSS | friend ratings, some posters | rolling ~50 entries, not history |
| `data/omdb-cache.json` | Rotten Tomatoes, Metacritic, poster URL | committed so a clone does not re-spend quota |

**Film record** (keys are short to keep the payload small)

| Key | Meaning | Key | Meaning |
|---|---|---|---|
| `k` | IMDb id, or `lb:<title>|<year>` if unresolved | `rt` | Rotten Tomatoes % |
| `t` `y` `r` | title, year, runtime | `mc` | Metacritic |
| `g` | genres array | `p` | poster URL |
| `d` | director(s) | `s` `w` | seen / watchlist flags |
| `i` `v` | IMDb score, votes | `m` | Nicolas's rating (0.5–5) |
| `top` | in the IMDb top 1000 | `f` | friend rating `{w, r}` |
| `dir` `bong` `nv` `nvc` | collection membership | | |

**Curation files** — edit these, not the build script:
`data/directors.json` (57 directors) · `data/collections.json` (Bong Joon Ho, Nouvelle Vague) · `data/excluded-directors.json`

---

## API

**None.** The app is fully static — it fetches one JSON file and does everything client-side. There is no server, so there is nothing to write back to: user removals live in `localStorage` under `movieapp.excluded.v1` and are therefore **per-device**.

---

## Known gotchas

Document surprises as they're discovered. Format: **what breaks**, why it breaks, how to fix or avoid it. This section compounds in value over time — every entry saves the next session from repeating a debugging loop.

<!-- Add entries here as you discover them. Example:
- **[Thing that breaks]:** What happens. Why. Fix: [workaround].
-->
- **Don't let a background agent delegate a bounded data-fetch task to further sub-agents.** Dispatching a general-purpose background agent for a well-defined, bounded pull (e.g., "fetch all X from API Y") risks a runaway sub-agent chain if the agent misreads its own tool-call results, wrongly concludes there's a platform bug, and spawns further agents to "verify." Those sub-agents often can't be force-killed by anyone except their direct parent — `TaskStop` can fail with an ownership restriction, leaving `SendMessage` (asking it to stop) as the only lever, with no guaranteed hard stop. Fix: do bounded, well-understood API pulls directly in the main session rather than delegating them. Reserve background agents for genuinely independent work where a single agent completes its own task without needing to spawn children — e.g., "scan this Slack workspace for a date range" or "scan this inbox," not "resolve this entire relational data tree across N interlinked API calls."
  - **If delegation is still the right call** (the task is large but genuinely bounded and independent), explicitly forbid nested spawning in the prompt: *"Do NOT spawn any sub-agents or delegate any part of this to another agent — do all the work yourself directly. If you're ever unsure whether a result looks right, just note the uncertainty in your final reply — do not launch a 'verification' sub-agent."* Confirmed effective in practice after a second occurrence of the exact runaway-chain failure above — the agent that received this instruction completed a large bounded task cleanly, while a sibling agent given the same class of task without it tried to spawn a nested agent instead of doing the work.
- **Never batch two read calls to the same MCP server in one message — their results can clobber each other.** When two reads to the same MCP server are issued in a single assistant turn, both tool results may come back identical (typically whichever query resolved last), silently returning the wrong data for one of them. This is not limited to two calls of the *same* tool — two *different* read tools on the same server (e.g. a "search" and a "get-by-id") can collide too. Fix: sequence reads to the same server one message at a time. Reads to *different* servers, or a read against a non-MCP tool, can still run in parallel safely.
- **For very high-volume gather work, delegate to parallel sub-agents that each write structured JSON to disk, then assemble with a script.** When a task requires ingesting far more source material than fits comfortably in one context (many documents/transcripts, a multi-day multi-source scan), reading it all inline guarantees a mid-task context compaction and the silent quality loss that comes with it. Instead: give every worker a shared spec file + a shared context file (both on disk), have each write its *full* extraction to its own `scratchpad/*.json` and return only a short summary, then merge all the JSON files into the final artifact with a deterministic script (normalization tables, dedup, ID assignment, stat computation). This is more compaction-safe than inline reading because the structured outputs persist on disk independent of the orchestrator's context. Caveat: the orchestrator never personally reads the raw source, so any "re-read the source yourself before finalizing" gate is satisfied by the on-disk extractions, not raw-file reads — disclose that trade-off. Pair this with the no-nested-spawning instruction above.
- **A tool installed mid-session stays invisible until Claude Code is restarted.** Installing Node, `gh`, or anything else that registers itself on PATH updates the *system* PATH, but the running Claude Code process keeps the environment it inherited at launch — so every shell it spawns still reports `command not found`, no matter how many new shells are opened inside the session. The install is fine; the session is stale. Fix: quit and reopen Claude Code after installing a tool. To confirm the install really did land before restarting, check the binary directly (`Test-Path "C:\Program Files\nodejs\node.exe"`) rather than trusting `node --version`, and if a command genuinely must run before the restart, invoke it by absolute path.
