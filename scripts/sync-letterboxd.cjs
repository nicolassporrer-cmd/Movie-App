/* Pulls the Letterboxd RSS diary and marks newly-watched films as seen.

   Runs daily in CI. The feed holds roughly the 50 most recent entries, which is
   far more headroom than a day of viewing, so nothing is missed between runs.

   What it CANNOT do: the watchlist. Letterboxd publishes a diary feed but not a
   watchlist feed, and their HTML returns 403 to automated clients. Watchlist
   changes still require a fresh CSV export.

   Usage:
     node scripts/sync-letterboxd.cjs                 apply changes
     node scripts/sync-letterboxd.cjs --dry-run       report only, write nothing
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const USER = process.env.LETTERBOXD_USER || 'nico_spo';
const DRY = process.argv.includes('--dry-run');

/* RSS carries HTML entities: "Don&#039;t Look Up". Normalising without decoding
   leaves the digits behind ("don039tlookup"), so the film silently fails to match
   its own record and gets re-added as a duplicate. Decode before anything else. */
function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
const norm = s => decode(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const body = m[1];
    const tag = t => {
      const r = new RegExp('<' + t + '>([^<]*)</' + t + '>').exec(body);
      return r ? r[1] : null;
    };
    const img = /<img src="([^"]+)"/.exec(body);
    const rawTitle = tag('letterboxd:filmTitle');
    return {
      title: rawTitle ? decode(rawTitle) : null,
      year: tag('letterboxd:filmYear'),
      rating: tag('letterboxd:memberRating'),
      rewatch: tag('letterboxd:rewatch') === 'Yes',
      watched: tag('letterboxd:watchedDate'),
      poster: img ? img[1] : null
    };
  }).filter(e => e.title && e.year);
}

(async () => {
  const url = 'https://letterboxd.com/' + USER + '/rss/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Movie-App sync)' } });
  if (!res.ok) throw new Error('Letterboxd RSS returned HTTP ' + res.status);
  const entries = parseFeed(await res.text());
  console.log('feed entries for ' + USER + ':', entries.length);
  if (!entries.length) {
    // An empty feed means "nothing to report", never "unwatch everything"
    console.log('Empty feed — nothing to apply. Leaving the dataset untouched.');
    return;
  }

  const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));
  const index = new Map();
  payload.films.forEach(f => index.set(norm(f.t) + '|' + f.y, f));

  const newlySeen = [], ratingChanged = [], added = [], unchanged = [];
  entries.forEach(e => {
    const key = norm(e.title) + '|' + e.year;
    const rating = e.rating != null ? parseFloat(e.rating) : null;
    let film = index.get(key);

    if (!film) {
      // Watched something outside the catalogue. Add it with what the feed gives;
      // runtime, genres and director stay null until the next full `npm run data`.
      film = {
        k: 'lb:' + key, t: e.title, y: +e.year || null, r: null, g: [],
        i: null, v: 0, d: null, s: 1, w: 0, m: rating, top: 0,
        dir: 0, bong: 0, nv: 0, nvc: 0
      };
      if (e.poster) film.p = e.poster;
      payload.films.push(film);
      index.set(key, film);
      added.push(e.title + ' (' + e.year + ')');
      return;
    }

    let touched = false;
    if (!film.s) { film.s = 1; newlySeen.push(e.title + ' (' + e.year + ')' + (film.w ? ' — was on the watchlist' : '')); touched = true; }
    if (rating != null && film.m !== rating) { film.m = rating; if (!touched) ratingChanged.push(e.title + ' → ' + rating); touched = true; }
    if (e.poster && !film.p) { film.p = e.poster; touched = true; }
    if (!touched) unchanged.push(e.title);
  });

  console.log('\nnewly seen:', newlySeen.length);
  newlySeen.forEach(t => console.log('  + ' + t));
  console.log('rating updated:', ratingChanged.length);
  ratingChanged.forEach(t => console.log('  ~ ' + t));
  console.log('added to the library:', added.length);
  added.forEach(t => console.log('  * ' + t + '  (metadata fills in on the next full data build)'));
  console.log('already up to date:', unchanged.length);

  if (DRY) { console.log('\nDRY RUN — nothing written.'); return; }
  if (!newlySeen.length && !ratingChanged.length && !added.length) {
    console.log('\nNo changes.');
    return;
  }

  // Recompute every count, not just the ones this script obviously touches —
  // an added film also changes the poster and score totals in the header.
  payload.counts.all = payload.films.length;
  payload.counts.seen = payload.films.filter(f => f.s).length;
  payload.counts.watchlist = payload.films.filter(f => f.w && !f.s).length;
  payload.counts.withRt = payload.films.filter(f => f.rt != null).length;
  payload.counts.withPoster = payload.films.filter(f => f.p).length;

  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  payload.builtAt = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';

  fs.writeFileSync(FILMS, JSON.stringify(payload));
  console.log('\nwritten. seen:', payload.counts.seen, '| still to watch:', payload.counts.watchlist, '| library:', payload.counts.all);
})();
