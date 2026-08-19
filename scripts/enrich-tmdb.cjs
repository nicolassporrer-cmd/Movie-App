/* Fetches French streaming availability from TMDB (data sourced from JustWatch).

   Two caches, deliberately with different lifetimes:
     data/tmdb-ids.json      IMDb id -> TMDB id. PERMANENT — the mapping never changes.
     data/providers-fr.json  TMDB id -> subscription providers. PERISHABLE — streaming
                             rights rotate constantly, so entries expire and refetch.

   That difference is the whole reason this is a separate script from the OMDb one:
   OMDb data is correct forever, provider data rots.

   Usage:
     node scripts/enrich-tmdb.cjs --probe              one film, show what comes back
     node scripts/enrich-tmdb.cjs --dry-run            report only
     node scripts/enrich-tmdb.cjs --limit 600          cap the run
     node scripts/enrich-tmdb.cjs --max-age-days 7     refetch anything older than this
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const IDS = path.join(ROOT, 'data', 'tmdb-ids.json');


// Region is per-run and each gets its own cache file — Nicolas watches from the US
// but VPNs to France for Canal+, so both regions are fetched and merged later.
const PROV_FOR = r => path.join(ROOT, 'data', 'providers-' + r.toLowerCase() + '.json');
const regionArg = (() => { const i = process.argv.indexOf('--region'); return i > -1 ? process.argv[i + 1] : null; })();
const REGION = (regionArg || process.env.TMDB_REGION || 'US').toUpperCase();
const CONCURRENCY = 6;                 // polite; TMDB allows far more
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = has('--dry-run'), PROBE = has('--probe');
const LIMIT = parseInt(val('--limit', '3000'), 10);
const MAX_AGE_DAYS = parseInt(val('--max-age-days', '7'), 10);

function readKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY.trim();
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  const m = /^\s*TMDB_API_KEY\s*=\s*(.*)$/m.exec(fs.readFileSync(p, 'utf8'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}
const KEY = readKey();
if (!KEY) {
  console.error('No TMDB key. Set TMDB_API_KEY in the environment, or in a .env FILE at the repo root.');
  process.exit(1);
}

const readJson = (p, d) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d;
const ids = readJson(IDS, {});
const PROV = PROV_FOR(REGION);
const prov = readJson(PROV, {});
const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));

const NOW = Date.now();
const AGE_MS = MAX_AGE_DAYS * 86400000;
const stale = entry => !entry || !entry.at || (NOW - entry.at) > AGE_MS;

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

const fetchProviders = async tmdbId => {
  const j = await api('https://api.themoviedb.org/3/movie/' + tmdbId + '/watch/providers?api_key=' + KEY);
  const r = (j.results || {})[REGION];
  // `flatrate` = included with a subscription. rent/buy are separate purchases and
  // are deliberately ignored: 13 rental options per film is noise, not information.
  const subs = r && r.flatrate ? r.flatrate.map(p => p.provider_name) : [];
  const free = r && r.free ? r.free.map(p => p.provider_name) : [];
  return { subs: [...new Set([...subs, ...free])], link: r ? r.link : null };
};

(async () => {
  const films = payload.films.filter(f => f.k && !f.k.startsWith('lb:'));
  console.log('films with an IMDb id:', films.length);
  console.log('tmdb id mappings cached:', Object.keys(ids).length, '| provider entries cached:', Object.keys(prov).length);

  if (PROBE) {
    const f = films[0];
    const tid = ids[f.k] || await findTmdb(f.k);
    console.log('probe:', f.t, '(' + f.k + ') -> TMDB', tid);
    if (tid) console.log(JSON.stringify(await fetchProviders(tid), null, 1));
    return;
  }

  const needId = films.filter(f => ids[f.k] === undefined);
  const needProv = films.filter(f => {
    const tid = ids[f.k];
    return tid !== null && (tid !== undefined || needId.includes(f)) && stale(prov[tid]);
  });
  console.log('need a TMDB id:', needId.length, '| need provider data (missing or older than ' + MAX_AGE_DAYS + 'd):', needProv.length);

  if (DRY) {
    console.log('\nDRY RUN — nothing written.');
    needProv.slice(0, 10).forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f.t + ' (' + f.y + ')'));
    return;
  }

  // Pass 1: resolve missing TMDB ids
  let done = 0, failed = 0;
  const queue = needId.slice(0, LIMIT);
  await runPool(queue, async f => {
    try { ids[f.k] = await findTmdb(f.k); }
    catch { ids[f.k] = undefined; failed++; return; }
    done++;
    if (done % 200 === 0) { fs.writeFileSync(IDS, JSON.stringify(ids)); console.log('  ids ' + done + '/' + queue.length); }
  });
  fs.writeFileSync(IDS, JSON.stringify(ids));
  const mapped = Object.values(ids).filter(v => v !== null && v !== undefined).length;
  console.log('tmdb ids resolved:', mapped, '| unmapped:', Object.values(ids).filter(v => v === null).length, '| errors:', failed);

  // Pass 2: providers for anything missing or stale
  const targets = [...new Set(films.map(f => ids[f.k]).filter(v => v))].filter(t => stale(prov[t])).slice(0, LIMIT);
  console.log('fetching providers for', targets.length, 'films...');
  let pdone = 0, pfail = 0;
  await runPool(targets, async tid => {
    try {
      const r = await fetchProviders(tid);
      prov[tid] = { subs: r.subs, link: r.link, at: Date.now() };
      pdone++;
    } catch { pfail++; }
    if ((pdone + pfail) % 200 === 0) { fs.writeFileSync(PROV, JSON.stringify(prov)); console.log('  providers ' + (pdone + pfail) + '/' + targets.length); }
  });
  fs.writeFileSync(PROV, JSON.stringify(prov));

  const withSubs = Object.values(prov).filter(p => p.subs && p.subs.length).length;
  const names = {};
  Object.values(prov).forEach(p => (p.subs || []).forEach(n => names[n] = (names[n] || 0) + 1));
  console.log('\nprovider entries:', Object.keys(prov).length, '| with a subscription option:', withSubs, '| errors:', pfail);
  console.log('top services in ' + REGION + ':');
  Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([n, c]) => console.log('  ' + String(c).padStart(4) + '  ' + n));
})();

async function runPool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); }
  }));
}
