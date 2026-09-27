/* When a newly-watched film has a director we do not yet follow, add that
   director's whole filmography — the standing rule, applied automatically.

   Why this cannot simply call build-data.cjs: that script derives filmographies
   from the IMDb datasets, ~600 MB of local-only files that CI does not have.
   So this resolves the same facts from TMDB, which CI can reach.

   Two things happen for each new director, and BOTH matter:

     1. the director is appended to data/directors.json — permanent, so the next
        full `npm run data` re-derives their films from IMDb and keeps them;
     2. their missing films are added immediately, so they appear the same night.

   Without (1) the next local build would quietly DELETE every film this script
   added, because build-data.cjs rebuilds the catalogue from the configured
   directors and would no longer see a reason to keep them.

   Fields set here come from TMDB only: title, year, runtime, genres, director.
   The IMDb score is deliberately left null — TMDB's vote_average is a different
   number from a different population, and showing it as an IMDb rating would be
   a fabricated value. apply-omdb.cjs fills the real one from OMDb afterwards.

   Usage:
     node scripts/expand-directors.cjs                  apply
     node scripts/expand-directors.cjs --dry-run        report only
     node scripts/expand-directors.cjs --max-directors 3  cap one run
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const DIRS = path.join(ROOT, 'data', 'directors.json');
const EXCL = path.join(ROOT, 'data', 'excluded-directors.json');

const DRY = process.argv.includes('--dry-run');
const argOf = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const MAX_DIRECTORS = +(argOf('--max-directors') || 6);
const THIS_YEAR = new Date().getFullYear();

function key() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY.trim();
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return null;
  const m = /^\s*TMDB_API_KEY\s*=\s*(.*)$/m.exec(fs.readFileSync(p, 'utf8'));
  return m ? m[1].trim() : null;
}
const KEY = key();
if (!KEY) { console.error('No TMDB key. Set TMDB_API_KEY or put it in .env at the repo root.'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tmdb(p, params) {
  const u = new URL('https://api.themoviedb.org/3' + p);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(u);
    if (r.status === 429) { await sleep(1500); continue; }   // rate limited, not an error
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('TMDB HTTP ' + r.status + ' for ' + p);
    return r.json();
  }
  throw new Error('TMDB kept rate-limiting ' + p);
}

(async () => {
  const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(DIRS, 'utf8'));
  const exclRaw = JSON.parse(fs.readFileSync(EXCL, 'utf8'));
  const exclIds = new Set((Array.isArray(exclRaw) ? exclRaw : exclRaw.directors || []).map(d => d.id || d));
  const cfgIds = new Set(cfg.map(d => d.id));
  const have = new Map(payload.films.map(f => [f.k, f]));

  /* Only films watched AND carrying an IMDb id can be resolved. A `lb:` film has
     no id to look up; it gets one at the next full build and is picked up then. */
  const candidates = payload.films.filter(f => f.s && /^tt/.test(f.k));
  console.log('seen films with an IMDb id: ' + candidates.length);

  const newDirectors = new Map();   // nm id -> { name, tmdbId, via }
  let looked = 0;

  for (const f of candidates) {
    if (newDirectors.size >= MAX_DIRECTORS) break;
    /* Cheap pre-filter: if the displayed director is already a configured name we
       skip the lookup entirely. Costs nothing and avoids most API calls. */
    if (f.d && cfg.some(d => f.d.includes(d.name))) continue;

    const found = await tmdb('/find/' + f.k, { external_source: 'imdb_id' });
    looked++;
    const movie = found && found.movie_results && found.movie_results[0];
    if (!movie) continue;
    const credits = await tmdb('/movie/' + movie.id + '/credits');
    const dirs = (credits && credits.crew || []).filter(c => c.job === 'Director');
    for (const d of dirs) {
      const ext = await tmdb('/person/' + d.id + '/external_ids');
      const nm = ext && ext.imdb_id;
      if (!nm || cfgIds.has(nm) || exclIds.has(nm) || newDirectors.has(nm)) continue;
      newDirectors.set(nm, { name: d.name, tmdbId: d.id, via: f.t + ' (' + f.y + ')' });
      if (newDirectors.size >= MAX_DIRECTORS) break;
    }
  }

  console.log('lookups made: ' + looked + ' | directors not yet followed: ' + newDirectors.size);
  if (!newDirectors.size) { console.log('Nothing to expand.'); return; }

  const addedFilms = [];
  for (const [nm, info] of newDirectors) {
    const credits = await tmdb('/person/' + info.tmdbId + '/movie_credits');
    const directed = (credits && credits.crew || []).filter(c => c.job === 'Director');
    const seenIds = new Set();
    let added = 0, skipped = 0;
    for (const c of directed) {
      if (seenIds.has(c.id)) continue;            // TMDB lists some films twice
      seenIds.add(c.id);
      const y = c.release_date ? +c.release_date.slice(0, 4) : 0;
      if (!y || y >= THIS_YEAR) { skipped++; continue; }   // unreleased, same rule as build-data
      const m = await tmdb('/movie/' + c.id);
      if (!m || !m.imdb_id || !/^tt/.test(m.imdb_id)) { skipped++; continue; }
      if (have.has(m.imdb_id)) continue;
      const film = {
        k: m.imdb_id, t: m.title, y, r: m.runtime || null,
        g: (m.genres || []).map(g => g.name),
        i: null, v: 0, d: info.name, s: 0, w: 0, m: null,
        top: 0, dir: 1, bong: 0, nv: 0, nvc: 0
      };
      payload.films.push(film);
      have.set(film.k, film);
      addedFilms.push(film);
      added++;
    }
    console.log('  ' + info.name + ' (' + nm + ') — watched ' + info.via + ' — added ' + added + ' films, skipped ' + skipped);
    cfg.push({ id: nm, name: info.name, source: 'watched-auto' });
  }

  console.log('\nnew directors: ' + newDirectors.size + ' | new films: ' + addedFilms.length);
  console.log('films added without a runtime: ' + addedFilms.filter(f => !f.r).length +
              ' | without genres: ' + addedFilms.filter(f => !f.g.length).length);
  if (DRY) { console.log('\nDRY RUN — nothing written.'); return; }

  fs.writeFileSync(DIRS, JSON.stringify(cfg, null, 2) + '\n');
  payload.counts.all = payload.films.length;
  payload.counts.seen = payload.films.filter(f => f.s).length;
  payload.counts.watchlist = payload.films.filter(f => f.w && !f.s).length;
  payload.counts.withRt = payload.films.filter(f => f.rt != null).length;
  payload.counts.withPoster = payload.films.filter(f => f.p).length;
  fs.writeFileSync(FILMS, JSON.stringify(payload));
  console.log('written. library: ' + payload.counts.all + ' | directors followed: ' + cfg.length);
})();
