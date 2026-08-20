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

console.log('home region:', HOME, '| films mapped:', mapped, '/', payload.films.length);
console.log('on one of your services at home :', atHome);
console.log('reachable only via VPN          :', viaVpn);
console.log('streaming on nothing, anywhere  :', nowhere);
console.log('');
console.log('VPN suggestions by service :', Object.entries(svcTally).sort((a, b) => b[1] - a[1]).map(([s, n]) => s + ' ' + n).join('  ') || 'none');
console.log('VPN suggestions by country :', Object.entries(ccTally).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => c + ' ' + n).join('  ') || 'none');
console.log('data gathered:', payload.providersAt);
console.log('films.json now', Math.round(fs.statSync(FILMS).size / 1024), 'KB');
