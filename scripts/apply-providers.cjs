/* Merges the per-region provider caches into public/data/films.json.

   Region setup lives in data/regions.json: a primary region supplies everything,
   and `extras` pulls named services from other regions on top (Canal+ from France,
   which Nicolas reaches over a VPN).

   Services listed individually are the ones Nicolas actually subscribes to, set in
   `listed`. Ranking by film count would surface Kanopy and Philo and bury Netflix,
   so volume is deliberately not the criterion. Everything else becomes "Others".

   Upsert only: a missing cache entry leaves a film's existing data alone.
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const IDS = path.join(ROOT, 'data', 'tmdb-ids.json');
const CFG = path.join(ROOT, 'data', 'regions.json');
const provPath = r => path.join(ROOT, 'data', 'providers-' + r.toLowerCase() + '.json');

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const OTHER = cfg.otherLabel || 'Others';


const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));

const readProv = r => {
  const p = provPath(r);
  if (!fs.existsSync(p)) { console.warn('  (no cache for region ' + r + ' — skipping)'); return {}; }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

/* TMDB lists billing routes, not services: "Netflix" and "Netflix Standard with Ads"
   are separate, as is an "… Amazon Channel" twin of almost everything. Collapse to
   the name a person would actually say. */
function canonical(raw) {
  let n = String(raw).replace(/\s{2,}/g, ' ').trim();
  n = n.replace(/\s+(Amazon|Apple TV|Roku)\s+(Premium\s+)?Channels?$/i, '');
  n = n.replace(/\s+(Standard\s+)?with\s+Ads$/i, '');
  // Tier suffixes, longest first — "Peacock Premium Plus" must not survive as
  // "Peacock Premium+" once the Plus rule below runs.
  n = n.replace(/\s+(Premium\s+Plus|Premium\+|Premium|Basic|Standard|Essential)$/i, '');
  n = n.replace(/\s+Plus\b/g, '+');   // "Paramount Plus" -> "Paramount+", leaves "Cine+ OCS" intact
  return n.trim();
}

const primary = readProv(cfg.primary);
const extraRegions = Object.keys(cfg.extras || {});
const extraCaches = Object.fromEntries(extraRegions.map(r => [r, readProv(r)]));
const extraAllowed = Object.fromEntries(
  extraRegions.map(r => [r, new Set((cfg.extras[r] || []).map(canonical))])
);
const regionOf = {};   // canonical name -> region it came from, for services outside the primary

// Pass 1: resolve each film's canonical service names across all configured regions
const perFilm = new Map();
let mapped = 0, oldest = Infinity, newest = 0;
payload.films.forEach(f => {
  const tid = ids[f.k];
  if (tid == null) { delete f.tid; delete f.pv; return; }
  f.tid = tid; mapped++;

  const set = new Set();
  const e = primary[tid];
  if (e) {
    if (e.at) { oldest = Math.min(oldest, e.at); newest = Math.max(newest, e.at); }
    (e.subs || []).forEach(n => set.add(canonical(n)));
  }
  extraRegions.forEach(r => {
    const x = extraCaches[r][tid];
    if (!x) return;
    if (x.at) { oldest = Math.min(oldest, x.at); newest = Math.max(newest, x.at); }
    (x.subs || []).forEach(raw => {
      const n = canonical(raw);
      if (extraAllowed[r].has(n)) { set.add(n); regionOf[n] = r; }
    });
  });
  perFilm.set(f.k, set);
});

// Pass 2: rank services, keep the top N, bucket the rest
const tally = new Map();
perFilm.forEach(set => set.forEach(n => tally.set(n, (tally.get(n) || 0) + 1)));
const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/* `listed` is Nicolas's actual subscriptions, not the highest-volume services.
   Ranking by film count surfaces Kanopy, Criterion and Philo — which carry hundreds
   of old films — while pushing Netflix into the tail. Volume is the wrong question;
   "do you pay for it" is the right one. Anything unlisted becomes "Others". */
const listed = (cfg.listed || []).map(canonical);
const missing = listed.filter(n => !tally.has(n));
const top = listed.filter(n => tally.has(n));
const topSet = new Set(top);
const tail = ranked.filter(([n]) => !topSet.has(n));
if (missing.length) console.warn('WARNING: listed but present on no film:', missing.join(', '));

const providers = [...top];
const otherIdx = tail.length ? providers.push(OTHER) - 1 : -1;
const idxOf = new Map(top.map((n, i) => [n, i]));

let withProviders = 0, inOther = 0;
payload.films.forEach(f => {
  const set = perFilm.get(f.k);
  if (!set || !set.size) { delete f.pv; return; }
  const out = new Set();
  let usedOther = false;
  set.forEach(n => {
    if (topSet.has(n)) out.add(idxOf.get(n));
    else if (otherIdx >= 0) { out.add(otherIdx); usedOther = true; }
  });
  if (!out.size) { delete f.pv; return; }
  f.pv = [...out].sort((a, b) => a - b);
  withProviders++;
  if (usedOther) inOther++;
});

payload.providers = providers;
payload.providerRegions = Object.fromEntries(
  providers.filter(n => regionOf[n]).map(n => [n, regionOf[n]])
);
payload.region = cfg.primary;
payload.defaultSubs = (cfg.defaultSubs || []).filter(n => providers.includes(n));
payload.counts.withProviders = withProviders;

const fmt = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); };
payload.providersAt = newest ? fmt(newest) : null;

fs.writeFileSync(FILMS, JSON.stringify(payload));

console.log('region:', cfg.primary, '| extras:', extraRegions.map(r => r + ':' + [...extraAllowed[r]].join(',')).join(' ') || 'none');
console.log('films mapped to a TMDB id:', mapped, '/', payload.films.length);
console.log('films on at least one service:', withProviders, '| of which only on tail services:', inOther);
console.log('');
console.log('listed services (' + top.length + '):');
top.forEach((n, i) => console.log(
  '  ' + String(i + 1).padStart(2) + '. ' + n.padEnd(22) + String(tally.get(n) || 0).padStart(4) + ' films'
  
  + (regionOf[n] ? '   [' + regionOf[n] + ' — via VPN]' : '')));
console.log('');
console.log('grouped into "' + OTHER + '": ' + tail.length + ' services, e.g. ' + tail.slice(0, 8).map(x => x[0]).join(', '));
console.log('films.json now', Math.round(fs.statSync(FILMS).size / 1024), 'KB');
