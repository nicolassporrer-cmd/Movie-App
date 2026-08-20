/* Merges data/providers-world.json into public/data/films.json.

   Two distinct answers per film:
     pv   — services carrying it in the home region. Green when he subscribes.
     alt  — ONE service+country pair abroad, when it is NOT on his services at home
            but is on one of them somewhere else. Shown pink: reachable over a VPN.

   Only one abroad option is emitted. He asked for a single solution, and a list of
   nine countries is not a decision, it is homework.

   Provider names are interned; the country is a two-letter code. Storing the full
   worldwide map per film would add megabytes to a payload the phone downloads.

   Upsert only: a missing cache entry leaves a film's existing data alone.
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const IDS = path.join(ROOT, 'data', 'tmdb-ids.json');
const WORLD = path.join(ROOT, 'data', 'providers-world.json');
const CFG = path.join(ROOT, 'data', 'regions.json');

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const OTHER = cfg.otherLabel || 'Others';
const HOME = cfg.primary || 'US';
const VPN_ORDER = cfg.vpnCountries || [];

if (!fs.existsSync(WORLD)) {
  console.error('No availability cache at ' + WORLD + ' — run enrich-tmdb.cjs first.');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));

const listed = cfg.listed || [];
const listedSet = new Set(listed);

// Listed services first, in his order; everything else collapses to "Others".
const providers = [...listed];
const otherIdx = providers.push(OTHER) - 1;
const idxOf = new Map(listed.map((n, i) => [n, i]));
const pick = n => listedSet.has(n) ? idxOf.get(n) : otherIdx;

// Rank abroad options: his preferred service first, then the preferred country.
const svcRank = n => { const i = listed.indexOf(n); return i === -1 ? 99 : i; };
const ccRank = c => VPN_ORDER.indexOf(c);
/* Hard limit, not just a ranking: without it the fallback offered "Netflix Angola"
   for Shawshank, picking whatever country sorted first. A suggestion he cannot act
   on is worse than no suggestion. */
const VPN_OK = new Set(VPN_ORDER);

let mapped = 0, atHome = 0, viaVpn = 0, nowhere = 0;
let oldest = Infinity, newest = 0;
const ccTally = {}, svcTally = {};

payload.films.forEach(f => {
  const tid = ids[f.k];
  if (tid == null) { delete f.tid; delete f.pv; delete f.alt; return; }
  f.tid = tid; mapped++;

  const w = world[tid];
  if (!w) { delete f.pv; delete f.alt; return; }
  if (w.at) { oldest = Math.min(oldest, w.at); newest = Math.max(newest, w.at); }

  const home = w.home || [];
  if (home.length) f.pv = [...new Set(home.map(pick))].sort((a, b) => a - b);
  else delete f.pv;

  // Only offer a VPN route when it is not already on one of his services at home.
  if (home.some(n => listedSet.has(n))) { atHome++; delete f.alt; return; }

  const options = [];
  Object.entries(w.abroad || {}).forEach(([cc, svcs]) =>
    { if (!VPN_OK.has(cc)) return; svcs.forEach(s => { if (listedSet.has(s)) options.push([s, cc]); }); });

  if (!options.length) {
    delete f.alt;
    if (!home.length) nowhere++;
    return;
  }

  options.sort((a, b) =>
    svcRank(a[0]) - svcRank(b[0]) || ccRank(a[1]) - ccRank(b[1]) || a[1].localeCompare(b[1]));
  const [svc, cc] = options[0];
  f.alt = [idxOf.get(svc), cc];
  viaVpn++;
  ccTally[cc] = (ccTally[cc] || 0) + 1;
  svcTally[svc] = (svcTally[svc] || 0) + 1;
});

payload.providers = providers;
payload.region = HOME;
payload.defaultSubs = (cfg.defaultSubs || []).filter(n => providers.includes(n));
payload.counts.withProviders = payload.films.filter(f => f.pv && f.pv.length).length;
payload.counts.viaVpn = viaVpn;
delete payload.providerRegions;

const fmt = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); };
payload.providersAt = newest ? fmt(newest) : null;

fs.writeFileSync(FILMS, JSON.stringify(payload));

/* Buckets must be mutually exclusive AND exhaustive. The first version counted
   "streaming nowhere" only when a film had no provider at all, so 459 films that
   stream solely on services he does not subscribe to fell through every counter
   and vanished from the summary — 386 + 888 + 441 did not come close to 2,199.
   A total that does not reconcile hides exactly the cases worth noticing, so it
   is asserted below rather than trusted. */
const listedIdx = new Set(listed.map(n => idxOf.get(n)));
const b = { green: 0, vpn: 0, otherOnly: 0, none: 0, noData: 0 };
payload.films.forEach(f => {
  if (!f.tid) { b.noData++; return; }
  if (f.pv && f.pv.some(i => listedIdx.has(i))) { b.green++; return; }
  if (f.alt) { b.vpn++; return; }
  if (f.pv && f.pv.length) { b.otherOnly++; return; }
  b.none++;
});
const sum = b.green + b.vpn + b.otherOnly + b.none + b.noData;

console.log('home region:', HOME, '| films mapped:', mapped, '/', payload.films.length);
console.log('  on your services at home        :', b.green);
console.log('  on your services abroad (VPN)   :', b.vpn);
console.log('  streaming, but only on Others   :', b.otherOnly);
console.log('  not streaming anywhere          :', b.none);
console.log('  no availability data            :', b.noData);
console.log('  ' + '-'.repeat(34) + ' ' + sum + ' / ' + payload.films.length);
if (sum !== payload.films.length) {
  console.error('  *** buckets do not reconcile — ' + (payload.films.length - sum) + ' films unaccounted for ***');
  process.exitCode = 1;
}
console.log('');
console.log('VPN suggestions by service :', Object.entries(svcTally).sort((a, b) => b[1] - a[1]).map(([s, n]) => s + ' ' + n).join('  ') || 'none');
console.log('VPN suggestions by country :', Object.entries(ccTally).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => c + ' ' + n).join('  ') || 'none');
console.log('data gathered:', payload.providersAt);
console.log('films.json now', Math.round(fs.statSync(FILMS).size / 1024), 'KB');
