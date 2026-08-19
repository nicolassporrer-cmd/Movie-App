/* Enriches films with Rotten Tomatoes, Metacritic, IMDb and (if OMDb provides it)
   a poster URL. Idempotent: results are cached per imdbId and never refetched.

   Usage:
     node scripts/enrich-omdb.js --probe        one call, reports which fields OMDb returns
     node scripts/enrich-omdb.js --dry-run      show what would be fetched, write nothing
     node scripts/enrich-omdb.js --limit 900    fetch at most N (free tier is 1000/day)
     node scripts/enrich-omdb.js --unseen-first prioritise films not yet watched
*/
const fs = require('fs');
const APP = 'C:/dev/Movie-App/';
const CACHE = APP + 'data/omdb-cache.json';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = has('--dry-run'), PROBE = has('--probe');
const LIMIT = parseInt(val('--limit', '900'), 10);
const UNSEEN_FIRST = has('--unseen-first');

function readEnv() {
  if (!fs.existsSync(APP + '.env')) { console.error('No .env file at ' + APP + '.env'); process.exit(1); }
  const out = {};
  fs.readFileSync(APP + '.env', 'utf8').split(/\r?\n/).forEach(l => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  return out;
}

const env = readEnv();
const KEY = env.OMDB_API_KEY;
if (!KEY) {
  console.error('OMDB_API_KEY is empty in .env — paste the key after the = sign and rerun.');
  process.exit(1);
}

const films = JSON.parse(fs.readFileSync(APP + 'data/films.json', 'utf8'));
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

const score = r => {
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
  const withId = films.filter(f => f.imdbId);
  console.log('films with an IMDb id:', withId.length, '| already cached:', Object.keys(cache).length);

  if (PROBE) {
    const sample = withId.find(f => f.title === 'The Shawshank Redemption') || withId[0];
    console.log('probing with:', sample.title, '(' + sample.imdbId + ')\n');
    try {
      const j = await fetchOne(sample.imdbId);
      const s = score(j);
      console.log('  Title    :', j.Title, j.Year);
      console.log('  Runtime  :', j.Runtime, '| Director:', j.Director);
      console.log('  IMDb     :', s.imdb, '| Rotten Tomatoes:', s.rt, '| Metacritic:', s.meta);
      console.log('  Poster   :', j.Poster && j.Poster !== 'N/A' ? j.Poster : '*** NOT PROVIDED ***');
      console.log('\n  => posters via OMDb are', (j.Poster && j.Poster !== 'N/A') ? 'AVAILABLE — TMDB is not needed' : 'NOT available — TMDB required');
    } catch (e) { console.error('  probe failed:', e.message); process.exit(1); }
    return;
  }

  let todo = withId.filter(f => !cache[f.imdbId]);
  if (UNSEEN_FIRST) todo.sort((a, b) => (a.seen === b.seen) ? b.votes - a.votes : (a.seen ? 1 : -1));
  else todo.sort((a, b) => b.votes - a.votes);
  const batch = todo.slice(0, LIMIT);

  console.log('to fetch:', todo.length, '| this run:', batch.length, DRY ? '(DRY RUN — nothing will be written)' : '');
  if (DRY) {
    batch.slice(0, 15).forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f.title + ' (' + f.year + ')  ' + f.imdbId + (f.seen ? '  [seen]' : '')));
    if (batch.length > 15) console.log('  ... and ' + (batch.length - 15) + ' more');
    console.log('\nremaining after this run:', todo.length - batch.length);
    return;
  }

  let ok = 0, fail = 0;
  for (let i = 0; i < batch.length; i++) {
    const f = batch[i];
    try {
      const j = await fetchOne(f.imdbId);
      const s = score(j);
      cache[f.imdbId] = {
        title: j.Title, year: j.Year, imdb: s.imdb, rt: s.rt, meta: s.meta,
        poster: j.Poster && j.Poster !== 'N/A' ? j.Poster : null,
        rated: j.Rated, country: j.Country, language: j.Language
      };
      ok++;
    } catch (e) {
      cache[f.imdbId] = { error: e.message };
      fail++;
    }
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
      console.log('  ' + (i + 1) + '/' + batch.length + '  ok:' + ok + ' fail:' + fail);
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
  const done = Object.values(cache);
  console.log('\nfetched ok:', ok, '| failed:', fail);
  console.log('cache now holds:', done.length, '| with RT:', done.filter(d => d.rt != null).length, '| with poster:', done.filter(d => d.poster).length);
  console.log('remaining:', withId.filter(f => !cache[f.imdbId]).length);
})();
