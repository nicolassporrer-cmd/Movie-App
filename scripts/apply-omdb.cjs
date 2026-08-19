/* Merges data/omdb-cache.json into public/data/films.json.

   Deliberately does NOT rebuild from the IMDb datasets — that needs ~500 MB of
   downloads. Scores and posters change often; the catalogue barely does. Run
   `npm run data` when the catalogue itself needs regenerating.

   Upsert only: a cache miss leaves the existing value alone and never clears it.
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const CACHE = path.join(ROOT, 'data', 'omdb-cache.json');

if (!fs.existsSync(CACHE)) { console.error('No OMDb cache at ' + CACHE); process.exit(1); }

const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

let addedRt = 0, addedMc = 0, addedPoster = 0, unchanged = 0;
payload.films.forEach(f => {
  const o = cache[f.k];
  if (!o || o.error) { unchanged++; return; }
  if (o.rt != null && f.rt !== o.rt) { f.rt = o.rt; addedRt++; }
  if (o.meta != null && f.mc !== o.meta) { f.mc = o.meta; addedMc++; }
  if (o.poster && f.p !== o.poster) { f.p = o.poster; addedPoster++; }
});

payload.counts.withRt = payload.films.filter(f => f.rt != null).length;
payload.counts.withPoster = payload.films.filter(f => f.p).length;

const d = new Date();
const pad = n => String(n).padStart(2, '0');
payload.builtAt = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';

fs.writeFileSync(FILMS, JSON.stringify(payload));
console.log('films:', payload.films.length, '| cache entries:', Object.keys(cache).length);
console.log('newly set — RT:', addedRt, 'Metacritic:', addedMc, 'posters:', addedPoster);
console.log('totals now — with RT:', payload.counts.withRt, '| with poster:', payload.counts.withPoster);
console.log('films still without an RT score:', payload.films.filter(f => f.rt == null).length);
