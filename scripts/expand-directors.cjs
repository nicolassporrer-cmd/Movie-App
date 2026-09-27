/* Standing rule: watching a film by a director we do not yet follow should pull
   in that director's whole filmography. This script is the half that can run
   anywhere — it works out WHO to follow and writes them to data/directors.json.
   build-data.cjs then adds the actual films on the next full `npm run data`.

   Why it does not add the films itself
   -----------------------------------
   The catalogue's rule for "is this a film" is IMDb's titleType === 'movie'.
   That lives in the IMDb datasets: ~600 MB of local-only files CI does not have.
   Resolving a filmography from TMDB instead was tried and rejected — measured on
   Danny Boyle, TMDB returns 25 directing credits where IMDb returns 15, the
   extra 11 being shorts, TV films and the 2012 Olympic opening ceremony. OMDb
   cannot separate them either: asked by id, it answers Type=movie for 10 of
   those 11. Films added that way would appear for a night and then be deleted by
   the next authoritative build — the silent-data-loss failure again, so the
   script stops at the director and leaves the films to the one source that
   knows the difference.

   Resolution path, all of it TMDB, none of it guessed from names:
     film's IMDb id -> /find -> /movie/{id}/credits -> Director
                             -> /person/{id}/external_ids -> the nm id

   Usage:
     node scripts/expand-directors.cjs              apply
     node scripts/expand-directors.cjs --dry-run    report only, write nothing
     node scripts/expand-directors.cjs --limit 40   cap the lookups in one run
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const DIRS = path.join(ROOT, 'data', 'directors.json');
const EXCL = path.join(ROOT, 'data', 'excluded-directors.json');
/* Letterboxd title|year -> IMDb id, for titles the two sites spell differently. */
const ALIAS = path.join(ROOT, 'data', 'letterboxd-ids.json');

const DRY = process.argv.includes('--dry-run');
const argOf = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const LIMIT = +(argOf('--limit') || 60);

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
    if (r.status === 429) { await sleep(1500); continue; }   // rate limited, not a failure
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

  /* Two kinds of watched film. One carries an IMDb id and is looked up directly.
     The other was added by the diary sync from a title and a year alone — a `lb:`
     key, no id, no director — because it was never in the catalogue. Those are
     searched by title and year instead; following their director is what finally
     pulls the film itself in, properly, at the next build. */
  const seen = payload.films.filter(f => f.s && /^tt/.test(f.k));
  const byTitle = payload.films.filter(f => f.s && !/^tt/.test(f.k) && f.t && f.y);

  /* Cheap pre-filter: a film whose displayed director is already followed needs
     no API call at all. On a settled library this skips essentially everything,
     which is what keeps a nightly run free. */
  const todo = seen.filter(f => !(f.d && cfg.some(d => f.d.includes(d.name))));
  console.log('seen films: ' + payload.films.filter(f => f.s).length +
              ' | with an IMDb id needing a lookup: ' + todo.length +
              ' | to match by title: ' + byTitle.length);

  const found = new Map();   // nm id -> { name, via }
  let calls = 0, mergedAny = false;

  /* A title search can return the wrong film, and a wrong film means following a
     director he has never watched. Accept a hit only when the year matches and
     the title matches once punctuation and case are stripped. */
  const fold = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  async function resolveMovie(f) {
    if (/^tt/.test(f.k)) {
      const hit = await tmdb('/find/' + f.k, { external_source: 'imdb_id' });
      calls++;
      return (hit && hit.movie_results && hit.movie_results[0]) || null;
    }
    const r = await tmdb('/search/movie', { query: f.t, primary_release_year: f.y });
    calls++;
    const cands = (r && r.results) || [];
    const exact = cands.find(c => {
      const y = c.release_date ? +c.release_date.slice(0, 4) : 0;
      return y === f.y && (fold(c.title) === fold(f.t) || fold(c.original_title) === fold(f.t));
    });
    if (!exact) console.log('  no confident match for ' + f.t + ' (' + f.y + ') — left alone rather than guessed');
    return exact || null;
  }

  /* Letterboxd's title is not IMDb's. "Dune" is "Dune: Part One", "The
     Accountant²" is "The Accountant 2", "Star Wars: The Force Awakens" is
     "Star Wars: Episode VII - The Force Awakens". Matching on the title alone
     therefore leaves the diary's stub sitting beside the real record — and the
     stub is the one holding "seen", so the app offers a film he has watched and
     hides that he watched it. Once TMDB gives the real IMDb id, record the alias
     so the diary sync lands on the right record from now on, and fold any stub
     that already exists into it. */
  const aliases = fs.existsSync(ALIAS) ? JSON.parse(fs.readFileSync(ALIAS, 'utf8')) : {};
  const byKey = new Map(payload.films.map(f => [f.k, f]));
  const dropped = new Set();
  function mergeStub(stub, tconst) {
    aliases[stub.k.replace(/^lb:/, '')] = tconst;
    mergedAny = true;
    const real = byKey.get(tconst);
    if (!real) return 'alias recorded, film not in the catalogue yet';
    if (stub.s) real.s = 1;
    if (stub.m != null && real.m == null) real.m = stub.m;
    if (stub.w) real.w = 1;
    dropped.add(stub.k);
    return 'merged into ' + tconst + ' — ' + real.t;
  }

  for (const f of [...todo, ...byTitle].slice(0, LIMIT)) {
    const movie = await resolveMovie(f);
    if (!movie) continue;
    if (!/^tt/.test(f.k)) {
      const ext = await tmdb('/movie/' + movie.id + '/external_ids');
      calls++;
      if (ext && /^tt/.test(ext.imdb_id || '')) {
        console.log('  ' + f.t + ' (' + f.y + '): ' + mergeStub(f, ext.imdb_id));
      }
    }
    const credits = await tmdb('/movie/' + movie.id + '/credits');
    calls++;
    for (const d of (credits && credits.crew || []).filter(c => c.job === 'Director')) {
      const ext = await tmdb('/person/' + d.id + '/external_ids');
      calls++;
      const nm = ext && ext.imdb_id;
      if (!nm) { console.log('  no IMDb id for ' + d.name + ' — skipped rather than guessed'); continue; }
      if (cfgIds.has(nm) || exclIds.has(nm) || found.has(nm)) continue;
      found.set(nm, { name: d.name, via: f.t + ' (' + f.y + ')' });
    }
  }

  console.log('TMDB calls: ' + calls + ' | directors to start following: ' + found.size);
  for (const [nm, info] of found) console.log('  + ' + info.name + '  ' + nm + '  (from ' + info.via + ')');
  if (DRY) { console.log('\nDRY RUN — nothing written.'); return; }

  /* Merges are saved before the "no new directors" exit, not after it. They are
     independent outcomes: a run can merge a duplicate and find nobody new, and an
     early return here would print "merged" while writing nothing. */
  if (mergedAny) {
    fs.writeFileSync(ALIAS, JSON.stringify(aliases, null, 2) + '\n');
    console.log('alias map written: ' + Object.keys(aliases).length + ' entries');
    if (dropped.size) {
      payload.films = payload.films.filter(f => !dropped.has(f.k));
      payload.counts.all = payload.films.length;
      payload.counts.seen = payload.films.filter(f => f.s).length;
      payload.counts.watchlist = payload.films.filter(f => f.w && !f.s).length;
      fs.writeFileSync(FILMS, JSON.stringify(payload));
      console.log('duplicate stubs folded into the real record: ' + dropped.size +
                  ' | library: ' + payload.counts.all + ' | seen: ' + payload.counts.seen);
    }
  }

  if (!found.size) { console.log('No new directors to follow.'); return; }
  for (const [nm, info] of found) cfg.push({ id: nm, name: info.name, source: 'watched-auto' });
  fs.writeFileSync(DIRS, JSON.stringify(cfg, null, 2) + '\n');
  console.log('written. directors followed: ' + cfg.length);
  console.log('Their films arrive with the next full `npm run data`.');
})();
