/* Fetches Rotten Tomatoes, Metacritic and poster URLs from OMDb.
   Idempotent: cached per imdbId in data/omdb-cache.json and never refetched.

   Key comes from OMDB_API_KEY in the environment (CI) or from .env (local).
   Paths resolve from the repo root, so this runs anywhere.

   Usage:
     node scripts/enrich-omdb.cjs --probe          one call; reports which fields OMDb returns
     node scripts/enrich-omdb.cjs --dry-run        show what would be fetched, write nothing
     node scripts/enrich-omdb.cjs --limit 900      cap the run (free tier is 1000/day)
     node scripts/enrich-omdb.cjs --unseen-first   prioritise films not yet watched
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, 'data', 'omdb-cache.json');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = has('--dry-run'), PROBE = has('--probe');
const LIMIT = parseInt(val('--limit', '900'), 10);
const UNSEEN_FIRST = has('--unseen-first');

function readKey() {
  if (process.env.OMDB_API_KEY) return process.env.OMDB_API_KEY.trim();
  const envPath = path.join(ROOT, '.env');
  // .env has previously existed here as a DIRECTORY — check it is a file
  if (!fs.existsSync(envPath) || !fs.statSync(envPath).isFile()) return null;
  const m = /^\s*OMDB_API_KEY\s*=\s*(.*)$/m.exec(fs.readFileSync(envPath, 'utf8'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

const KEY = readKey();
if (!KEY) {
  console.error('No OMDb key. Set OMDB_API_KEY in the environment, or put it in a .env FILE at the repo root.');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));
const films = payload.films;
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

const scores = r => {
  const out = { imdb: null, rt: null, meta: null };
  (r.Ratings || []).forEach(x => {
    if (x.Source === 'Internet Movie Database') out.imdb = parseFloat(x.Value);
    if (x.Source === 'Rotten Tomatoes') out.rt = parseInt(x.Value, 10);
    if (x.Source === 'Metacritic') out.meta = parseInt(x.Value, 10);
  });
  return out;
};

async function fetchOne(id) {
  const url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(KEY) + '&i=' + encodeURIComponent(id) + '&tomatoes=true';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (j.Response === 'False') throw new Error(j.Error || 'not found');
  return j;
}

(async () => {
  // 'lb:' keys are Letterboxd films that never resolved to an IMDb id
  const withId = films.filter(f => f.k && !f.k.startsWith('lb:'));
  console.log('films with an IMDb id:', withId.length, '| already cached:', Object.keys(cache).length);

  if (PROBE) {
    const sample = withId[0];
    console.log('probing with:', sample.t, '(' + sample.k + ')');
    const j = await fetchOne(sample.k);
    const s = scores(j);
    console.log('  IMDb', s.imdb, '| RT', s.rt, '| Metacritic', s.meta);
    console.log('  Poster:', j.Poster && j.Poster !== 'N/A' ? j.Poster : '*** NOT PROVIDED ***');
    return;
  }

  let todo = withId.filter(f => !cache[f.k]);
  if (UNSEEN_FIRST) todo.sort((a, b) => (!!a.s === !!b.s) ? b.v - a.v : (a.s ? 1 : -1));
  else todo.sort((a, b) => b.v - a.v);
  const batch = todo.slice(0, LIMIT);

  console.log('to fetch:', todo.length, '| this run:', batch.length, DRY ? '(DRY RUN)' : '');
  if (DRY) {
    batch.slice(0, 12).forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f.t + ' (' + f.y + ')' + (f.s ? '  [seen]' : '')));
    if (batch.length > 12) console.log('  ... and ' + (batch.length - 12) + ' more');
    return;
  }
  if (!batch.length) { console.log('Nothing to do — every film is already cached.'); return; }

  let ok = 0, fail = 0, quota = false;
  for (let i = 0; i < batch.length; i++) {
    const f = batch[i];
    try {
      const j = await fetchOne(f.k);
      const s = scores(j);
      cache[f.k] = {
        title: j.Title, year: j.Year, imdb: s.imdb, rt: s.rt, meta: s.meta,
        poster: j.Poster && j.Poster !== 'N/A' ? j.Poster : null
      };
      ok++;
    } catch (e) {
      // A daily-quota rejection means stop — not "mark every remaining film broken",
      // which would poison the cache and permanently skip those films.
      if (/limit|quota/i.test(e.message)) { console.log('  quota reached after ' + i + ' — stopping'); quota = true; break; }
      cache[f.k] = { error: e.message };
      fail++;
    }
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.log('  ' + (i + 1) + '/' + batch.length + '  ok:' + ok + ' fail:' + fail);
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  const done = Object.values(cache);
  console.log('\nfetched ok:', ok, '| failed:', fail, quota ? '| stopped on quota' : '');
  console.log('cache holds:', done.length, '| with RT:', done.filter(d => d.rt != null).length, '| with poster:', done.filter(d => d.poster).length);
  console.log('remaining:', withId.filter(f => !cache[f.k]).length);
})();
