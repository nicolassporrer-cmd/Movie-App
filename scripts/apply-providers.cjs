/* Merges data/providers-fr.json into public/data/films.json.

   Provider names are interned into a shared list and referenced by index — the same
   dozen names repeat across 2,000+ films, so storing strings per film would add
   hundreds of KB for nothing.

   The TMDB watch link is not stored per film either; it is derived client-side from
   the TMDB id, which is a small integer.

   Upsert only: a missing cache entry leaves the film's existing data alone.
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILMS = path.join(ROOT, 'public', 'data', 'films.json');
const IDS = path.join(ROOT, 'data', 'tmdb-ids.json');
const PROV = path.join(ROOT, 'data', 'providers-fr.json');

if (!fs.existsSync(PROV)) { console.error('No provider cache at ' + PROV); process.exit(1); }

const payload = JSON.parse(fs.readFileSync(FILMS, 'utf8'));
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
const prov = JSON.parse(fs.readFileSync(PROV, 'utf8'));

/* TMDB lists billing routes, not services: "Netflix" and "Netflix Standard with Ads"
   are separate entries, as are three Paramount variants and everything sold as an
   "Amazon Channel". Nicolas subscribes to Netflix, not to two Netflixes — so collapse
   them to the service a person would actually name. */
function canonical(raw) {
  let n = String(raw).replace(/\s{2,}/g, ' ').trim();
  n = n.replace(/\s+(Amazon|Apple TV)\s+Channels?$/i, '');
  n = n.replace(/\s+(Standard\s+)?with\s+Ads$/i, '');
  n = n.replace(/\s+(Premium|Basic|Standard)$/i, '');
  // "Paramount Plus" -> "Paramount+", but leave an existing "+" alone: collapsing
  // spaces around every plus turns "Cine+ OCS" into "Cine+OCS".
  n = n.replace(/\s+Plus\b/g, '+');
  return n.trim();
}

const names = [];
const merged = new Map();   // canonical -> set of raw names folded into it
const indexOf = raw => {
  const n = canonical(raw);
  if (!merged.has(n)) merged.set(n, new Set());
  merged.get(n).add(raw);
  let i = names.indexOf(n);
  if (i === -1) { names.push(n); i = names.length - 1; }
  return i;
};

let withProviders = 0, mapped = 0, oldest = Infinity, newest = 0;
payload.films.forEach(f => {
  const tid = ids[f.k];
  if (tid == null) { delete f.tid; delete f.pv; return; }
  f.tid = tid; mapped++;
  const entry = prov[tid];
  if (!entry) { delete f.pv; return; }
  if (entry.at) { oldest = Math.min(oldest, entry.at); newest = Math.max(newest, entry.at); }
  if (entry.subs && entry.subs.length) {
    f.pv = [...new Set(entry.subs.map(indexOf))];   // dedupe after collapsing variants
    withProviders++;
  } else {
    delete f.pv;   // known to be on nothing, rather than unknown — same render either way
  }
});

// Order the list by how many films each service carries, so the picker reads sensibly.
const counts = new Map(names.map((n, i) => [i, 0]));
payload.films.forEach(f => (f.pv || []).forEach(i => counts.set(i, counts.get(i) + 1)));
const order = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i);
const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
payload.providers = order.map(i => names[i]);
payload.films.forEach(f => { if (f.pv) f.pv = f.pv.map(i => remap.get(i)).sort((a, b) => a - b); });

const fmt = ms => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
};
payload.providersAt = newest ? fmt(newest) : null;
payload.counts.withProviders = withProviders;

fs.writeFileSync(FILMS, JSON.stringify(payload));
const kb = Math.round(fs.statSync(FILMS).size / 1024);
console.log('films mapped to a TMDB id:', mapped, '/', payload.films.length);
console.log('films on at least one subscription service:', withProviders);
console.log('distinct services after collapsing variants:', payload.providers.length);
console.log('top 12:', payload.providers.slice(0, 12).join(', '));
const folded = [...merged.entries()].filter(([, raws]) => raws.size > 1);
if (folded.length) {
  console.log('\ncollapsed billing variants:');
  folded.slice(0, 10).forEach(([n, raws]) => console.log('  ' + n + '  <-  ' + [...raws].join(' / ')));
}
console.log('data freshness:', oldest === Infinity ? 'n/a' : fmt(oldest) + ' .. ' + fmt(newest));
console.log('films.json now', kb, 'KB');
