/* Merges data/providers-world.json into public/data/films.json.

   Nicolas splits his time between the US and France, so availability is emitted
   per home country and the app switches between them client-side:

     av   { US: [providerIdx...], FR: [...] }   services carrying it in that country.
                                                Green when he subscribes, grey when
                                                it is only the "Others" bucket.
     alt  { US: [providerIdx, "CC"], FR: [...] } ONE service+country pair reachable
                                                over a VPN, computed per home country
                                                and never suggesting the country he
                                                is already in.

   Only one abroad option per country. He asked for a single solution, and a list of
   nine countries is not a decision, it is homework.

   Provider names are interned; countries are two-letter codes. Shipping the full
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
const HOMES = cfg.homeCountries || ['US'];
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

const svcRank = n => { const i = listed.indexOf(n); return i === -1 ? 99 : i; };
const ccRank = c => VPN_ORDER.indexOf(c);
/* Hard limit, not just a ranking: without it the fallback offered "Netflix Angola"
   for Shawshank, picking whatever country sorted first. A suggestion he cannot act
   on is worse than no suggestion. */
const VPN_OK = new Set(VPN_ORDER);

const stats = Object.fromEntries(HOMES.map(cc => [cc, { green: 0, vpn: 0, otherOnly: 0, none: 0 }]));
let mapped = 0, oldest = Infinity, newest = 0;

payload.films.forEach(f => {
  const tid = ids[f.k];
  delete f.pv; delete f.alt;                    // superseded by the per-country fields
  if (tid == null) { delete f.tid; delete f.av; return; }
  f.tid = tid; mapped++;

  const w = world[tid];
  if (!w) { delete f.av; return; }
  if (w.at) { oldest = Math.min(oldest, w.at); newest = Math.max(newest, w.at); }

  const home = w.home || {};
  const av = {}, alt = {};

  HOMES.forEach(cc => {
    const here = home[cc] || [];
    if (here.length) av[cc] = [...new Set(here.map(pick))].sort((a, b) => a - b);

    // Already on one of his services here? Then no VPN suggestion is needed.
    if (here.some(n => listedSet.has(n))) { stats[cc].green++; return; }

    /* Candidates from anywhere except where he currently is — including the OTHER
       home country, which is the common case: Canal+ from the US, Peacock from
       France. */
    const options = [];
    Object.entries(w.abroad || {}).forEach(([oc, svcs]) => {
      if (oc === cc || !VPN_OK.has(oc)) return;
      svcs.forEach(s => { if (listedSet.has(s)) options.push([s, oc]); });
    });

    if (!options.length) {
      if (here.length) stats[cc].otherOnly++; else stats[cc].none++;
      return;
    }
    options.sort((a, b) =>
      svcRank(a[0]) - svcRank(b[0]) || ccRank(a[1]) - ccRank(b[1]) || a[1].localeCompare(b[1]));
    alt[cc] = [idxOf.get(options[0][0]), options[0][1]];
    stats[cc].vpn++;
  });

  if (Object.keys(av).length) f.av = av; else delete f.av;
  if (Object.keys(alt).length) f.alt = alt; else delete f.alt;
});

payload.providers = providers;
payload.homeCountries = HOMES;
payload.defaultCountry = cfg.defaultCountry || HOMES[0];
payload.defaultSubs = (cfg.defaultSubs || []).filter(n => providers.includes(n));
delete payload.region; delete payload.providerRegions;

const fmt = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); };
payload.providersAt = newest ? fmt(newest) : null;

const listedIdx = new Set(listed.map(n => idxOf.get(n)));
payload.counts.byCountry = {};
HOMES.forEach(cc => {
  payload.counts.byCountry[cc] = {
    green: payload.films.filter(f => f.av && f.av[cc] && f.av[cc].some(i => listedIdx.has(i))).length,
    vpn: payload.films.filter(f => f.alt && f.alt[cc]).length
  };
});

fs.writeFileSync(FILMS, JSON.stringify(payload));

console.log('home countries:', HOMES.join(', '), '| films mapped:', mapped, '/', payload.films.length);
HOMES.forEach(cc => {
  const s = stats[cc];
  const sum = s.green + s.vpn + s.otherOnly + s.none;
  console.log('');
  console.log('  ' + cc + ':');
  console.log('    on your services here      :', s.green);
  console.log('    reachable via VPN          :', s.vpn);
  console.log('    only on services you lack  :', s.otherOnly);
  console.log('    nothing, anywhere          :', s.none);
  console.log('    ' + '-'.repeat(28) + ' ' + sum + ' + ' + (payload.films.length - sum) + ' with no data = ' + payload.films.length);
});
console.log('');
console.log('data gathered:', payload.providersAt, '| films.json now', Math.round(fs.statSync(FILMS).size / 1024), 'KB');
