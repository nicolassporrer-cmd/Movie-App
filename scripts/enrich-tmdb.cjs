/* Fetches worldwide streaming availability from TMDB (data sourced from JustWatch).

   TMDB returns EVERY country in a single call — 48 for a typical film. The earlier
   version read one country and threw the rest away, then fetched a second region
   separately for Canal+. That was wasted work: the whole world arrives for free.

   Two caches with deliberately different lifetimes:
     data/tmdb-ids.json        IMDb id -> TMDB id. PERMANENT — the mapping never changes.
     data/providers-world.json TMDB id -> availability. PERISHABLE — rights rotate,
                               so entries carry a timestamp and expire.

   To keep the cache small, the home region keeps every provider (needed for the
   "Others" bucket) while other countries keep only services the user subscribes to,
   since the only question elsewhere is "could I reach this over a VPN".

   Usage:
     node scripts/enrich-tmdb.cjs --probe
     node scripts/enrich-tmdb.cjs --dry-run
     node scripts/enrich-tmdb.cjs --limit 600
     node scripts/enrich-tmdb.cjs --max-age-days 7
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const IDS = path.join(ROOT, 'data', 'tmdb-ids.json');
const WORLD = path.join(ROOT, 'data', 'providers-world.json');
const CFG = path.join(ROOT, 'data', 'regions.json');

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const HOME = cfg.primary || 'US';

const CONCURRENCY = 6;
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = has('--dry-run'), PROBE = has('--probe');
const LIMIT = parseInt(val('--limit', '5000'), 10);
const MAX_AGE_DAYS = parseInt(val('--max-age-days', '7'), 10);

function readKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY.trim();
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  const m = /^\s*TMDB_API_KEY\s*=\s*(.*)$/m.exec(fs.readFileSync(p, 'utf8'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}
const KEY = readKey();
if (!KEY) { console.error('No TMDB key. Set TMDB_API_KEY, or put it in a .env FILE at the repo root.'); process.exit(1); }

/* TMDB lists billing routes, not services. Kept in step with apply-providers.cjs. */
function canonical(raw) {
  let n = String(raw).replace(/\s{2,}/g, ' ').trim();
  n = n.replace(/\s+(Amazon|Apple TV|Roku)\s+(Premium\s+)?Channels?$/i, '');
  n = n.replace(/\s+(Standard\s+)?with\s+Ads$/i, '');
  n = n.replace(/\s+(Premium\s+Plus|Premium\+|Premium|Basic|Standard|Essential)$/i, '');
  n = n.replace(/\s+Plus\b/g, '+');
  return n.trim();
}
const MINE = new Set((cfg.listed || []).map(canonical));

const readJson = (p, d) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d;
const ids = readJson(IDS, {});
const world = readJson(WORLD, {});
const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));

const NOW = Date.now();
const AGE_MS = MAX_AGE_DAYS * 86400000;
const stale = e => !e || !e.at || (NOW - e.at) > AGE_MS;

async function api(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2000 * (i + 1))); continue; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  throw new Error('rate limited after retries');
}

const findTmdb = async imdb => {
  const j = await api('https://api.themoviedb.org/3/find/' + imdb + '?external_source=imdb_id&api_key=' + KEY);
  const m = j.movie_results && j.movie_results[0];
  return m ? m.id : null;
};

// One call, every country. `flatrate` and `free` only — rent and buy answer a
// different question and would add a dozen options per film.
async function fetchWorld(tmdbId) {
  const j = await api('https://api.themoviedb.org/3/movie/' + tmdbId + '/watch/providers?api_key=' + KEY);
  const res = j.results || {};
  const out = { home: [], abroad: {} };
  Object.entries(res).forEach(([cc, v]) => {
    const subs = [...new Set([...(v.flatrate || []), ...(v.free || [])].map(x => canonical(x.provider_name)))];
    if (!subs.length) return;
    if (cc === HOME) { out.home = subs; return; }
    const mine = subs.filter(s => MINE.has(s));
    if (mine.length) out.abroad[cc] = mine;
  });
  return out;
}

(async () => {
  const films = payload.films.filter(f => f.k && !f.k.startsWith('lb:'));
  console.log('films with an IMDb id:', films.length, '| home region:', HOME);
  console.log('services treated as "mine":', [...MINE].join(', '));
  console.log('tmdb ids cached:', Object.keys(ids).length, '| world entries cached:', Object.keys(world).length);

  if (PROBE) {
    const f = films.find(x => x.t === 'Mommy') || films[0];
    const tid = ids[f.k] || await findTmdb(f.k);
    console.log('\nprobe:', f.t, '->', tid);
    console.log(JSON.stringify(await fetchWorld(tid), null, 1));
    return;
  }

  const needId = films.filter(f => ids[f.k] === undefined).slice(0, LIMIT);
  if (needId.length) {
    let n = 0;
    await runPool(needId, async f => {
      try { ids[f.k] = await findTmdb(f.k); } catch { return; }
      if (++n % 200 === 0) { fs.writeFileSync(IDS, JSON.stringify(ids)); console.log('  ids ' + n + '/' + needId.length); }
    });
    fs.writeFileSync(IDS, JSON.stringify(ids));
    console.log('tmdb ids resolved this run:', n);
  }

  const targets = [...new Set(films.map(f => ids[f.k]).filter(Boolean))].filter(t => stale(world[t])).slice(0, LIMIT);
  console.log('films needing availability (missing or older than ' + MAX_AGE_DAYS + 'd):', targets.length);
  if (DRY) { console.log('DRY RUN — nothing written.'); return; }
  if (!targets.length) { console.log('Everything is current.'); return; }

  let ok = 0, fail = 0;
  await runPool(targets, async tid => {
    try { const w = await fetchWorld(tid); world[tid] = { home: w.home, abroad: w.abroad, at: Date.now() }; ok++; }
    catch { fail++; }
    if ((ok + fail) % 200 === 0) { fs.writeFileSync(WORLD, JSON.stringify(world)); console.log('  ' + (ok + fail) + '/' + targets.length); }
  });
  fs.writeFileSync(WORLD, JSON.stringify(world));

  const vals = Object.values(world);
  const homeOnly = vals.filter(v => v.home && v.home.length).length;
  const abroadOnly = vals.filter(v => (!v.home || !v.home.length) && v.abroad && Object.keys(v.abroad).length).length;
  console.log('\nfetched ok:', ok, '| failed:', fail);
  console.log('entries:', vals.length, '| streaming at home:', homeOnly, '| not at home but on one of your services abroad:', abroadOnly);
  const ccTally = {};
  vals.forEach(v => Object.keys(v.abroad || {}).forEach(cc => ccTally[cc] = (ccTally[cc] || 0) + 1));
  console.log('top countries for VPN options:', Object.entries(ccTally).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => c + ':' + n).join('  '));
  console.log('cache size:', Math.round(fs.statSync(WORLD).size / 1024), 'KB');
})();

async function runPool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); }
  }));
}
