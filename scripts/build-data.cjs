/* Produces public/data/films.json — the app's entire dataset.
   Sources: IMDb official datasets, the Letterboxd export, friend RSS, OMDb cache.
   Nothing here is invented; missing values are null and the UI shows a dash. */
const fs = require('fs'), zlib = require('zlib'), readline = require('readline');
const D = 'C:/dev/_letterboxd_data/';
const APP = 'C:/dev/Movie-App/';
const MIN_VOTES = 50000, TOP_N = 1000;

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const stream = f => readline.createInterface({ input: fs.createReadStream(D + f).pipe(zlib.createGunzip()), crlfDelay: Infinity });

function csv(p) {
  const t = fs.readFileSync(D + p, 'utf8').trim().split(/\r?\n/), h = t[0].split(',');
  return t.slice(1).map(l => {
    const c = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { c.push(cur); cur = ''; } else cur += ch; }
    c.push(cur); return Object.fromEntries(h.map((k, i) => [k, c[i]]));
  });
}
function rss(u) {
  const p = D + 'rss/rss_' + u + '.xml';
  if (!fs.existsSync(p)) return [];
  const x = fs.readFileSync(p, 'utf8');
  return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const g = t => { const r = new RegExp('<' + t + '>([^<]*)</' + t + '>').exec(m[1]); return r ? r[1] : null; };
    const img = /<img src="([^"]+)"/.exec(m[1]);
    return { title: g('letterboxd:filmTitle'), year: g('letterboxd:filmYear'), rating: g('letterboxd:memberRating'), poster: img ? img[1] : null };
  });
}

(async () => {
  const watched = csv('watched.csv'), ratingsCsv = csv('ratings.csv'), wl = csv('watchlist.csv');
  const myRating = {}; ratingsCsv.forEach(r => myRating[norm(r.Name) + '|' + r.Year] = +r.Rating);
  const reg = rss('Regelegorila'), me = rss('nico_spo');
  const lbPoster = {}, friend = {};
  [...me, ...reg].forEach(i => { if (i.poster) lbPoster[norm(i.title) + '|' + i.year] = i.poster; });
  reg.forEach(i => { if (i.rating) friend[norm(i.title) + '|' + i.year] = { w: 'Regelegorila', r: +i.rating }; });

  const DIRLIST = JSON.parse(fs.readFileSync(APP + 'data/directors.json', 'utf8'));
  const COLL = JSON.parse(fs.readFileSync(APP + 'data/collections.json', 'utf8'));
  const EXCL = JSON.parse(fs.readFileSync(APP + 'data/excluded-directors.json', 'utf8'));
  const dirIds = new Set(DIRLIST.map(d => d.id));
  const bongIds = new Set(COLL['bong-joon-ho'].directors.map(d => d.id));
  const nvIds = new Set(COLL['nouvelle-vague'].directors.map(d => d.id));
  const exclIds = new Set(EXCL.directors.map(d => d.id));
  const [NV_FROM, NV_TO] = COLL['nouvelle-vague'].corePeriod;

  const rat = new Map();
  fs.readFileSync(D + 'ratings.tsv', 'utf8').split('\n').forEach((l, i) => {
    if (!i) return; const p = l.split('\t'); if (p.length < 3) return;
    rat.set(p[0], { r: +p[1], v: +p[2] });
  });

  // titleType must be 'movie' — otherwise the top of the ratings file is TV episodes
  const byId = new Map(), byTitle = new Map(), best = new Map();
  await new Promise(res => {
    const rl = stream('basics.tsv.gz');
    rl.on('line', l => {
      const p = l.split('\t');
      if (p[1] !== 'movie') return;
      const rec = { id: p[0], title: p[2], year: +p[5] || null, runtime: +p[7] || null, genres: p[8] === '\\N' ? [] : p[8].split(',') };
      byId.set(p[0], rec);
      // title+year is not unique — resolve collisions toward the most-voted film
      const v = (rat.get(p[0]) || { v: 0 }).v;
      [norm(p[2]) + '|' + rec.year, norm(p[3]) + '|' + rec.year].forEach(k => {
        if (!byTitle.has(k) || v > (best.get(k) || 0)) { byTitle.set(k, p[0]); best.set(k, v); }
      });
    });
    rl.on('close', res);
  });

  const crew = new Map();
  await new Promise(res => {
    const rl = stream('crew.tsv.gz');
    rl.on('line', l => {
      const p = l.split('\t');
      if (!byId.has(p[0]) || !p[1] || p[1] === '\\N') return;
      crew.set(p[0], p[1].split(','));
    });
    rl.on('close', res);
  });

  const top = [...byId.values()].filter(m => { const r = rat.get(m.id); return r && r.v >= MIN_VOTES; })
    .map(m => Object.assign({}, m, rat.get(m.id)))
    .sort((a, b) => b.r - a.r || b.v - a.v).slice(0, TOP_N);
  const topIds = new Set(top.map(m => m.id));

  const films = new Map();
  const excluded = id => (crew.get(id) || []).some(d => exclIds.has(d));

  /* IMDb lists announced projects as `movie` titles — "Untitled Taika Waititi Star
     Wars Film", four Beatles biopics dated 2028, Avatar 4 (2029). They have no year
     or no rating because they do not exist yet, so they clutter the catalogue with
     rows nobody can watch. Skip anything unrated that is dated this year or later,
     or has no year at all. Films the user has actually logged are added separately
     and are never affected by this. */
  const THIS_YEAR = new Date().getFullYear();
  const unreleased = id => {
    const m = byId.get(id);
    if (!m) return false;
    if (rat.get(id)) return false;                 // has votes, so it is out
    return !m.year || m.year >= THIS_YEAR;
  };
  const ensure = id => {
    if (films.has(id)) return films.get(id);
    const m = byId.get(id), r = rat.get(id), ds = crew.get(id) || [];
    const rec = {
      k: id, t: m.title, y: m.year, r: m.runtime, g: m.genres,
      i: r ? r.r : null, v: r ? r.v : 0, dIds: ds,
      s: 0, w: 0, m: null, top: topIds.has(id) ? 1 : 0,
      dir: ds.some(d => dirIds.has(d)) ? 1 : 0,
      bong: ds.some(d => bongIds.has(d)) ? 1 : 0,
      nv: ds.some(d => nvIds.has(d)) ? 1 : 0,
      nvc: ds.some(d => nvIds.has(d)) && m.year >= NV_FROM && m.year <= NV_TO ? 1 : 0
    };
    films.set(id, rec); return rec;
  };

  let dropped = 0, skippedUnreleased = 0;
  topIds.forEach(id => { if (excluded(id)) { dropped++; return; } ensure(id); });
  crew.forEach((ds, id) => {
    if (ds.some(d => exclIds.has(d))) { if (!topIds.has(id)) dropped++; return; }
    if (!ds.some(d => dirIds.has(d) || bongIds.has(d) || nvIds.has(d))) return;
    if (unreleased(id)) { skippedUnreleased++; return; }
    ensure(id);
  });

  let unresolved = 0;
  const attach = (rows, field) => rows.forEach(row => {
    const key = norm(row.Name) + '|' + row.Year;
    const id = byTitle.get(key);
    let rec;
    if (id) rec = ensure(id);
    else {
      const lk = 'lb:' + key;
      if (!films.has(lk)) {
        films.set(lk, { k: lk, t: row.Name, y: +row.Year || null, r: null, g: [], i: null, v: 0, dIds: [], s: 0, w: 0, m: null, top: 0, dir: 0, bong: 0, nv: 0, nvc: 0 });
        unresolved++;
      }
      rec = films.get(lk);
    }
    rec[field] = 1;
    if (field === 's') rec.m = myRating[key] || null;
    if (lbPoster[key]) rec.p = lbPoster[key];
    if (friend[key]) rec.f = friend[key];
  });
  attach(watched, 's');
  attach(wl, 'w');

  const needed = new Set();
  films.forEach(f => f.dIds.forEach(n => needed.add(n)));
  // Also resolve every configured director, so the dropdown can use IMDb's own
  // spelling rather than whatever was typed into the config files.
  [...DIRLIST, ...COLL['bong-joon-ho'].directors, ...COLL['nouvelle-vague'].directors]
    .forEach(d => needed.add(d.id));
  const nameOf = new Map();
  await new Promise(res => {
    const rl = stream('names.tsv.gz');
    rl.on('line', l => { const p = l.split('\t'); if (needed.has(p[0])) nameOf.set(p[0], p[1]); });
    rl.on('close', res);
  });

  const omdb = fs.existsSync(APP + 'data/omdb-cache.json') ? JSON.parse(fs.readFileSync(APP + 'data/omdb-cache.json', 'utf8')) : {};
  let rtN = 0, posterN = 0;
  films.forEach(f => {
    const names = f.dIds.map(n => nameOf.get(n)).filter(Boolean);
    f.d = names.slice(0, 2).join(', ') || null;   // display: two names keeps the card readable
    // `da` carries every director and is used for filtering only. Without it a
    // third-billed director is unfindable, since the dropdown matches on display.
    if (names.length > 2) f.da = names.join(', ');
    delete f.dIds;
    const o = omdb[f.k];
    if (o && !o.error) {
      if (o.rt != null) { f.rt = o.rt; rtN++; }
      if (o.meta != null) f.mc = o.meta;
      if (o.poster) { f.p = o.poster; }
    }
    if (f.p) posterN++;
  });

  const all = [...films.values()].sort((a, b) => (b.i || 0) - (a.i || 0) || b.v - a.v);
  const genres = [...new Set(all.flatMap(f => f.g))].sort();
  /* Names come from IMDb, never from the config files. Hand-typed names drift from
     the data — "Alejandro G. Inarritu" in directors.json never matched
     "Alejandro G. Iñárritu" in the films, so his 11 titles were unreachable from the
     dropdown despite being present. Same for Kieślowski, Cuarón and Forman. */
  const configured = [...DIRLIST, ...COLL['bong-joon-ho'].directors, ...COLL['nouvelle-vague'].directors];
  const mismatches = configured.filter(d => nameOf.get(d.id) && nameOf.get(d.id) !== d.name);
  const directors = [...new Set(configured.map(d => nameOf.get(d.id) || d.name))].sort();
  if (mismatches.length) {
    console.log('config names corrected from IMDb (' + mismatches.length + '):');
    mismatches.forEach(d => console.log('  "' + d.name + '"  ->  "' + nameOf.get(d.id) + '"'));
  }
  const unresolvedDirs = configured.filter(d => !nameOf.get(d.id));
  if (unresolvedDirs.length) console.warn('WARNING: director ids that resolved to no name:', unresolvedDirs.map(d => d.name + '/' + d.id).join(', '));

  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const payload = {
    builtAt: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
    counts: {
      all: all.length,
      seen: all.filter(f => f.s).length,
      watchlist: all.filter(f => f.w && !f.s).length,
      withRt: rtN, withPoster: posterN, unresolved: unresolved
    },
    genres: genres, directors: directors,
    nvPeriod: [NV_FROM, NV_TO],
    films: all
  };

  fs.mkdirSync(APP + 'public/data', { recursive: true });
  fs.writeFileSync(APP + 'public/data/films.json', JSON.stringify(payload));
  const kb = Math.round(fs.statSync(APP + 'public/data/films.json').size / 1024);
  console.log('films:', all.length, '| dropped (excluded directors):', dropped, '| skipped (unreleased/announced):', skippedUnreleased, '| unresolved:', unresolved);
  console.log('with RT:', rtN, '| with poster:', posterN);
  console.log('genres:', genres.length, '| directors:', directors.length);
  console.log('written public/data/films.json —', kb, 'KB');
})();
