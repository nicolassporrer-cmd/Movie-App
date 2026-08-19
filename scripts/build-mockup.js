/* Builds mockup-browse.html from real sources only.
   One deduplicated film store; tabs are views over it. Nothing is invented. */
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
  const x = fs.readFileSync(D + 'rss/rss_' + u + '.xml', 'utf8');
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
  const poster = {}, friend = {};
  [...me, ...reg].forEach(i => { if (i.poster) poster[norm(i.title) + '|' + i.year] = i.poster; });
  reg.forEach(i => { if (i.rating) friend[norm(i.title) + '|' + i.year] = { who: 'Regelegorila', r: +i.rating }; });

  const TOP50 = JSON.parse(fs.readFileSync(APP + 'data/top50-directors.json', 'utf8'));
  const COLL = JSON.parse(fs.readFileSync(APP + 'data/collections.json', 'utf8'));
  const top50Ids = new Set(TOP50.map(d => d.id));
  const bongIds = new Set(COLL['bong-joon-ho'].directors.map(d => d.id));
  const nvIds = new Set(COLL['nouvelle-vague'].directors.map(d => d.id));
  const nvGroup = new Map(COLL['nouvelle-vague'].directors.map(d => [d.id, d.group]));
  const [NV_FROM, NV_TO] = COLL['nouvelle-vague'].corePeriod;

  const rat = new Map();
  fs.readFileSync(D + 'ratings.tsv', 'utf8').split('\n').forEach((l, i) => {
    if (!i) return; const p = l.split('\t'); if (p.length < 3) return;
    rat.set(p[0], { r: +p[1], v: +p[2] });
  });

  // MOVIES only — without this the top of the ratings file is TV episodes
  const byId = new Map(), byTitle = new Map();
  await new Promise(res => {
    const rl = stream('basics.tsv.gz');
    rl.on('line', l => {
      const p = l.split('\t');
      if (p[1] !== 'movie') return;
      const rec = { id: p[0], title: p[2], orig: p[3], year: +p[5] || null, runtime: +p[7] || null, genres: p[8] === '\\N' ? [] : p[8].split(',') };
      byId.set(p[0], rec);
      const k1 = norm(p[2]) + '|' + rec.year, k2 = norm(p[3]) + '|' + rec.year;
      if (!byTitle.has(k1)) byTitle.set(k1, p[0]);
      if (!byTitle.has(k2)) byTitle.set(k2, p[0]);
    });
    rl.on('close', res);
  });
  console.log('movies indexed:', byId.size.toLocaleString());

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

  const topPool = [...byId.values()].filter(m => { const r = rat.get(m.id); return r && r.v >= MIN_VOTES; })
    .map(m => Object.assign({}, m, rat.get(m.id)))
    .sort((a, b) => b.r - a.r || b.v - a.v);
  const top = topPool.slice(0, TOP_N);
  const topIds = new Set(top.map(m => m.id));

  // ---- ONE deduplicated store, keyed by tconst (or lb:<key> when unresolved)
  const films = new Map();
  const flagsOf = id => {
    const ds = crew.get(id) || [];
    return {
      top50: ds.some(d => top50Ids.has(d)),
      bong: ds.some(d => bongIds.has(d)),
      nv: ds.some(d => nvIds.has(d)),
      nvGroups: [...new Set(ds.filter(d => nvIds.has(d)).map(d => nvGroup.get(d)))]
    };
  };
  const ensure = id => {
    if (films.has(id)) return films.get(id);
    const m = byId.get(id), r = rat.get(id), f = flagsOf(id);
    const rec = {
      key: id, t: m.title, y: m.year, runtime: m.runtime, genres: m.genres,
      imdb: r ? r.r : null, votes: r ? r.v : 0, dirIds: crew.get(id) || [],
      seen: false, wl: false, mine: null, top1000: topIds.has(id),
      top50: f.top50, bong: f.bong, nv: f.nv, nvGroups: f.nvGroups,
      nvCore: f.nv && m.year >= NV_FROM && m.year <= NV_TO, resolved: true
    };
    films.set(id, rec); return rec;
  };

  topIds.forEach(id => ensure(id));
  crew.forEach((ds, id) => { if (ds.some(d => top50Ids.has(d) || bongIds.has(d) || nvIds.has(d))) ensure(id); });

  let unresolved = 0;
  const attachLb = (rows, field) => rows.forEach(r => {
    const k = norm(r.Name) + '|' + r.Year;
    const id = byTitle.get(k);
    let rec;
    if (id) rec = ensure(id);
    else {
      const lk = 'lb:' + k;
      if (!films.has(lk)) {
        films.set(lk, { key: lk, t: r.Name, y: +r.Year || null, runtime: null, genres: [], imdb: null, votes: 0, dirIds: [], seen: false, wl: false, mine: null, top1000: false, top50: false, bong: false, nv: false, nvGroups: [], nvCore: false, resolved: false });
        unresolved++;
      }
      rec = films.get(lk);
    }
    rec[field] = true;
    if (field === 'seen') rec.mine = myRating[k] || null;
    if (poster[k]) rec.poster = poster[k];
    if (friend[k]) rec.fr = friend[k];
  });
  attachLb(watched, 'seen');
  attachLb(wl, 'wl');

  // ---- director names, only those we display
  const needed = new Set();
  films.forEach(f => f.dirIds.forEach(n => needed.add(n)));
  const nameOf = new Map();
  await new Promise(res => {
    const rl = stream('names.tsv.gz');
    rl.on('line', l => { const p = l.split('\t'); if (needed.has(p[0])) nameOf.set(p[0], p[1]); });
    rl.on('close', res);
  });
  films.forEach(f => { f.dir = f.dirIds.map(n => nameOf.get(n)).filter(Boolean).slice(0, 2).join(', ') || null; });

  const all = [...films.values()];
  const counts = {
    all: all.length,
    seen: all.filter(f => f.seen).length,
    towatch: all.filter(f => f.wl && !f.seen).length,
    discover: all.filter(f => f.top1000 && !f.seen).length,
    directors: all.filter(f => f.top50 && !f.seen).length,
    bong: all.filter(f => f.bong).length,
    nv: all.filter(f => f.nv).length
  };
  const nvCore = all.filter(f => f.nvCore).length;

  const inTab = (f, t) => t === 'all' ? true
    : t === 'seen' ? f.seen
    : t === 'towatch' ? (f.wl && !f.seen)
    : t === 'discover' ? (f.top1000 && !f.seen)
    : t === 'directors' ? (f.top50 && !f.seen)
    : t === 'bong' ? f.bong
    : t === 'nv' ? f.nv : false;
  const TABS = ['all', 'seen', 'towatch', 'discover', 'directors', 'bong', 'nv'];

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DASH = '<span class="unk">&mdash;</span>';
  const stars = v => v == null ? '' : '\u2605'.repeat(Math.floor(v)) + (v % 1 ? '\u00bd' : '');
  const allGen = [...new Set(all.flatMap(f => f.genres))].sort();
  const allDirs = [...new Set([...TOP50.map(d => d.name), ...COLL['bong-joon-ho'].directors.map(d => d.name), ...COLL['nouvelle-vague'].directors.map(d => d.name)])].sort();

  all.sort((a, b) => (b.imdb || 0) - (a.imdb || 0) || b.votes - a.votes);

  const card = f => [
    '<article class="c" data-key="', esc(f.key), '" data-tabs="', TABS.filter(t => inTab(f, t)).join('|'),
    '" data-g="', esc(f.genres.join('|')),
    '" data-imdb="', (f.imdb == null ? -1 : f.imdb), '" data-run="', (f.runtime == null ? -1 : f.runtime),
    '" data-y="', (f.y || 0), '" data-fr="', (f.fr ? 1 : 0), '" data-frv="', (f.fr ? f.fr.r : 0),
    '" data-dir="', esc(f.dir || ''), '" data-t="', esc(f.t), '">',
    '<div class="p"><button class="rm" title="Remove from database">&times;</button>',
    '<button class="rs" title="Restore">&#8630; Restore</button>',
    f.poster ? '<img loading="lazy" src="' + f.poster + '" alt="">' : '<div class="ph">' + esc(f.t) + '</div>', '</div>',
    '<div class="b">',
    '<div class="flags">',
    f.seen ? '<span class="fl seen">Seen</span>' : '',
    (f.wl && !f.seen) ? '<span class="fl wl">Watchlist</span>' : '',
    f.nvCore ? '<span class="fl nv">Nouvelle Vague</span>' : (f.nv ? '<span class="fl nvl">NV director</span>' : ''),
    f.bong ? '<span class="fl bong">Bong Joon Ho</span>' : '',
    (f.top1000 && !f.seen) ? '<span class="fl top">Top 1000</span>' : '',
    '</div>',
    '<h3>', esc(f.t), '</h3>',
    '<div class="mt">', (f.y || DASH), ' \u00b7 ', (f.runtime ? f.runtime + 'm' : DASH), ' \u00b7 ', (f.dir ? esc(f.dir) : DASH), '</div>',
    '<div class="ch">', (f.genres.length ? f.genres.map(g => '<span>' + esc(g) + '</span>').join('') : '<span class="unk">no genre data</span>'), '</div>',
    '<div class="rt">', (f.imdb != null ? '<span class="im">IMDb ' + f.imdb.toFixed(1) + '</span>' : '<span class="unk">IMDb &mdash;</span>'),
    '<span class="unk">RT &mdash;</span></div>',
    '<div class="you">',
    (f.mine ? '<span class="ys">You ' + stars(f.mine) + '</span>' : (f.seen ? '<span class="nu">Watched, not rated</span>' : '<span class="nu">Not seen</span>')),
    (f.fr ? '<span class="fs">' + esc(f.fr.who) + ' ' + stars(f.fr.r) + '</span>' : '<span class="nf">No friend rating</span>'),
    '</div></div></article>'
  ].join('');

  const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Movie-App Mockup v4</title>
<style>
:root{--bg:#fbfaf9;--fg:#1a1a1a;--mut:#6b6b6b;--card:#fff;--bd:#e5e2df;--acc:#00A85A;--pur:#6b4cff;--nv:#c2410c;--bong:#0369a1;--info:#0a5a8a;--infobg:#e3f1fa}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141414;--fg:#ededed;--mut:#9a9a9a;--card:#1e1e1e;--bd:#333;--pur:#a48cff;--nv:#fb923c;--bong:#7dd3fc;--info:#7cc4ee;--infobg:#10293a}}
:root[data-theme=dark]{--bg:#141414;--fg:#ededed;--mut:#9a9a9a;--card:#1e1e1e;--bd:#333;--pur:#a48cff;--nv:#fb923c;--bong:#7dd3fc;--info:#7cc4ee;--infobg:#10293a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.w{max-width:1180px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--mut);font-size:13px;margin-bottom:14px}
.info{background:var(--infobg);color:var(--info);border:1px solid currentColor;border-radius:8px;padding:11px 14px;font-size:13px;margin-bottom:18px;line-height:1.55}
.tabs{display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--bd);flex-wrap:wrap}
.tab{padding:9px 14px;border:0;background:none;color:var(--mut);font:inherit;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;font-size:13.5px}
.tab.on{color:var(--fg);border-bottom-color:var(--acc)}
.f{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;padding:12px 14px;background:var(--card);border:1px solid var(--bd);border-radius:10px;margin-bottom:16px}
.f label{font-size:11.5px;color:var(--mut);display:flex;flex-direction:column;gap:3px}
select,input[type=range]{font:inherit;font-size:13px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg)}
select{padding:4px 6px;max-width:180px}
input[type=range]{width:112px;padding:0;accent-color:var(--acc)}
.chk{flex-direction:row!important;align-items:center;gap:5px;font-size:12.5px;color:var(--fg)}
.dice{padding:9px 18px;border:0;border-radius:8px;background:var(--acc);color:#fff;font:inherit;font-weight:700;cursor:pointer;font-size:14px}
.cnt{margin-left:auto;font-size:13px;color:var(--mut);align-self:center}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:14px}
.c{background:var(--card);border:1px solid var(--bd);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.p{aspect-ratio:2/3;background:#8881;overflow:hidden;position:relative}
.p img{width:100%;height:100%;object-fit:cover;display:block}
.rm{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:0;background:#000a;color:#fff;font-size:17px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;z-index:2}
.c:hover .rm{opacity:1}
.rm:hover{background:#c0392b}
.rs{position:absolute;top:6px;left:6px;border:0;border-radius:6px;background:var(--acc);color:#fff;font:inherit;font-size:11px;font-weight:700;padding:4px 8px;cursor:pointer;display:none;z-index:2}
.c.gone .rs{display:block}
.c.gone .rm{display:none}
.c.gone .p img{filter:grayscale(1);opacity:.45}
.c.gone{opacity:.75}
.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:11px 16px;border-radius:9px;font-size:13.5px;display:none;align-items:center;gap:14px;z-index:20;box-shadow:0 6px 24px #0004}
.toast.on{display:flex}
.toast button{background:none;border:0;color:var(--acc);font:inherit;font-weight:700;cursor:pointer;padding:0}
.tc{opacity:.6;font-weight:600}
.rmtab{margin-left:auto;opacity:.75}
.ph{width:100%;height:100%;display:grid;place-items:center;text-align:center;padding:10px;font-size:12px;color:var(--mut)}
.b{padding:9px 10px 11px;display:flex;flex-direction:column;gap:6px;flex:1}
h3{font-size:13.5px;margin:0;line-height:1.3}
.mt{font-size:11.5px;color:var(--mut)}
.flags{display:flex;flex-wrap:wrap;gap:4px}
.fl{font-size:9.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:1px 5px;border-radius:3px;border:1px solid currentColor}
.fl.seen{color:var(--acc)}.fl.wl{color:var(--pur)}.fl.nv{color:var(--nv)}.fl.nvl{color:var(--nv);opacity:.65}
.fl.bong{color:var(--bong)}.fl.top{color:var(--mut)}
.ch{display:flex;gap:4px;flex-wrap:wrap}
.ch span{font-size:10.5px;padding:1.5px 6px;border:1px solid var(--bd);border-radius:99px;color:var(--mut)}
.rt{display:flex;gap:7px;font-size:11px}
.im{color:#b8901f;font-weight:600}
.unk{color:var(--mut);opacity:.45}
.you{display:flex;flex-direction:column;gap:1px;font-size:11.5px;margin-top:auto}
.ys{color:var(--acc);font-weight:600}
.fs{color:var(--pur);font-weight:600}
.nu,.nf{color:var(--mut);opacity:.55}
.empty{display:none;text-align:center;padding:60px 20px;color:var(--mut)}
.ov{display:none;position:fixed;inset:0;background:#000b;place-items:center;padding:20px;z-index:9}
.ov.on{display:grid}
.pick{background:var(--card);border-radius:14px;max-width:560px;width:100%;padding:22px;border:1px solid var(--bd)}
.pick h2{margin:0 0 3px;font-size:20px}
.pick .pm{color:var(--mut);font-size:13px;margin-bottom:12px}
.pick .row{display:flex;gap:16px}
.pick .pp{width:120px;aspect-ratio:2/3;border-radius:8px;overflow:hidden;background:#8881;flex:none}
.pick .pp img{width:100%;height:100%;object-fit:cover}
.pick .acts{display:flex;gap:8px;margin-top:16px}
.pick button{padding:9px 16px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
.pick .pri{background:var(--acc);color:#fff;border-color:var(--acc)}
</style>
<div class="w">
<h1>Movie-App &mdash; browse, discover, shuffle</h1>
<div class="sub">Mockup v4 &middot; ${counts.all.toLocaleString()} unique films &middot; every value is real or explicitly blank</div>
<div class="info"><strong>All films</strong> is the whole database, deduplicated &mdash; a film appears once no matter how many collections it belongs to, with badges showing which.<br>
<strong>Nouvelle Vague</strong> has no formal membership; the list used is the Cahiers du cinéma core plus the Left Bank group, defined in <code>data/collections.json</code> and editable. Films from ${NV_FROM}&ndash;${NV_TO} are badged as the movement's active period (${nvCore} of ${counts.nv}); later films by the same directors are kept so the database stays complete.<br>
<strong>Blank (&mdash;):</strong> Rotten Tomatoes everywhere, and posters for all but the ~50 films in the RSS window. Both need API keys.</div>
<div class="tabs">
<button class="tab on" data-t="all">All films <span class="tc" data-tc="all"></span></button>
<button class="tab" data-t="seen">Seen <span class="tc" data-tc="seen"></span></button>
<button class="tab" data-t="towatch">To Watch <span class="tc" data-tc="towatch"></span></button>
<button class="tab" data-t="discover">Unseen top ${TOP_N} <span class="tc" data-tc="discover"></span></button>
<button class="tab" data-t="directors">Top-50 directors <span class="tc" data-tc="directors"></span></button>
<button class="tab" data-t="bong">Bong Joon Ho <span class="tc" data-tc="bong"></span></button>
<button class="tab" data-t="nv">Nouvelle Vague <span class="tc" data-tc="nv"></span></button>
<button class="tab rmtab" data-t="removed">Removed <span class="tc" data-tc="removed"></span></button>
</div>
<div class="f">
<label>Genre<select id="fg"><option value="">All</option>${allGen.map(g => '<option>' + esc(g) + '</option>').join('')}</select></label>
<label>Director<select id="fd"><option value="">All</option>${allDirs.map(d => '<option>' + esc(d) + '</option>').join('')}</select></label>
<label>Min IMDb <span id="li">0.0</span><input type="range" id="fi" min="0" max="10" step="0.1" value="0"></label>
<label>Max runtime <span id="lu">300m</span><input type="range" id="fu" min="60" max="300" step="5" value="300"></label>
<label>Sort by<select id="fs"><option value="imdb">IMDb</option><option value="t">Title</option><option value="frv">Friend rating</option><option value="run">Runtime</option><option value="y">Year</option></select></label>
<label class="chk"><input type="checkbox" id="fo"> Friend-rated only</label>
<button class="dice" id="dice">&#127922; Pick one for me</button>
<span class="cnt" id="cnt"></span>
</div>
<div class="g" id="g">${all.map(card).join('')}</div>
<div class="empty" id="e"><p><strong>Nothing matches these filters.</strong></p><p>Widen a slider, or clear the genre.</p></div>
</div>
<div class="ov" id="ov"><div class="pick" id="pick"></div></div>
<div class="toast" id="toast"><span id="tmsg"></span><button id="tundo">Undo</button></div>
<script>
var D = [].slice.call(document.querySelectorAll('.c')).map(function(el){
  return {el:el, key:el.dataset.key, t:el.dataset.t, tabs:el.dataset.tabs.split('|'), g:el.dataset.g, imdb:+el.dataset.imdb,
    run:+el.dataset.run, y:+el.dataset.y, fr:+el.dataset.fr, frv:+el.dataset.frv, dir:el.dataset.dir};
});
var tab='all', shown=[];
function $(i){return document.getElementById(i);}

/* Removal is an EXCLUSION LIST, never a delete. The database is rebuilt from the
   IMDb datasets, so a deleted row would simply reappear on the next build;
   an exclusion keyed by film id survives a rebuild. */
var STORE='movieapp.excluded.v1';
var excluded = (function(){ try { return new Set(JSON.parse(localStorage.getItem(STORE)||'[]')); } catch(e){ return new Set(); } })();
/* Array.from, not [].slice.call: a Set has no length, so slice.call returns []
   and every exclusion is silently persisted as an empty list. */
function persist(){ try { localStorage.setItem(STORE, JSON.stringify(Array.from(excluded))); } catch(e){} }

var toastTimer=null, lastUndo=null;
function toast(msg, undoFn){
  $('tmsg').textContent=msg; lastUndo=undoFn;
  $('toast').classList.add('on');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ $('toast').classList.remove('on'); }, 6000);
}
$('tundo').addEventListener('click', function(){
  if(lastUndo) lastUndo();
  $('toast').classList.remove('on');
});

function setExcluded(f, on){
  if(on) excluded.add(f.key); else excluded['delete'](f.key);
  f.el.classList.toggle('gone', on);
  persist(); apply();
}
document.getElementById('g').addEventListener('click', function(e){
  var btn=e.target.closest('.rm,.rs'); if(!btn) return;
  var el=btn.closest('.c'); var f=D.filter(function(x){return x.el===el;})[0]; if(!f) return;
  if(btn.classList.contains('rm')){
    setExcluded(f,true);
    toast('Removed "'+f.t+'"', function(){ setExcluded(f,false); });
  } else {
    setExcluded(f,false);
    toast('Restored "'+f.t+'"', function(){ setExcluded(f,true); });
  }
});

function apply(){
  var g=$('fg').value,d=$('fd').value,i=+$('fi').value,u=+$('fu').value,s=$('fs').value,o=$('fo').checked;
  $('li').textContent=i.toFixed(1); $('lu').textContent=u+'m';
  shown=[];
  var tally={all:0,seen:0,towatch:0,discover:0,directors:0,bong:0,nv:0,removed:0};
  D.forEach(function(f){
    var gone=excluded.has(f.key);
    f.el.classList.toggle('gone', gone);
    if(gone) tally.removed++;
    else f.tabs.forEach(function(t){ if(tally[t]!==undefined) tally[t]++; });
    var inThisTab = tab==='removed' ? gone : (!gone && f.tabs.indexOf(tab)>-1);
    var ok = inThisTab
      && (!g || f.g.split('|').indexOf(g)>-1)
      && (!d || f.dir.indexOf(d)>-1)
      && (i===0 || (f.imdb>=0 && f.imdb>=i))
      && (u===300 || (f.run>=0 && f.run<=u))
      && (!o || f.fr);
    f.el.style.display = ok ? '' : 'none';
    if(ok) shown.push(f);
  });
  Object.keys(tally).forEach(function(k){
    var n=document.querySelector('.tc[data-tc="'+k+'"]'); if(n) n.textContent='('+tally[k]+')';
  });
  shown.sort(function(a,b){
    if(s==='t') return a.t.localeCompare(b.t);
    if(s==='run') return (a.run<0?1e9:a.run)-(b.run<0?1e9:b.run);
    return b[s]-a[s];
  });
  var G=$('g'); shown.forEach(function(f){G.appendChild(f.el);});
  $('cnt').textContent = shown.length + (shown.length===1?' film':' films');
  $('e').style.display = shown.length ? 'none' : 'block';
}
function roll(){
  var P=$('pick');
  if(!shown.length){
    P.innerHTML='<h2>Nothing to pick from</h2><p class="pm">Every film is filtered out. Widen a filter and roll again.</p><div class="acts"><button onclick="closeOv()">Close</button></div>';
    $('ov').classList.add('on'); return;
  }
  var f=shown[Math.floor(Math.random()*shown.length)];
  var img=f.el.querySelector('img');
  var gen=[].slice.call(f.el.querySelectorAll('.ch span')).map(function(x){return x.textContent;}).join(', ');
  P.innerHTML='<h2>'+f.t+'</h2><div class="pm">'+(f.y||'\\u2014')+' \\u00b7 '+(f.run>=0?f.run+' min':'\\u2014')+' \\u00b7 '+(f.dir||'\\u2014')+'</div>'+
    '<div class="row"><div class="pp">'+(img?'<img src="'+img.src+'">':'')+'</div>'+
    '<div><p style="margin:0 0 8px">'+gen+'</p>'+
    '<p style="margin:0"><strong>'+(f.imdb>=0?'IMDb '+f.imdb.toFixed(1):'IMDb \\u2014')+'</strong></p>'+
    '<p style="margin:8px 0 0;font-size:13px;opacity:.7">Picked from the '+shown.length+' films matching your current filters.</p></div></div>'+
    '<div class="acts"><button class="pri" id="again">Roll again</button><button onclick="closeOv()">Close</button></div>';
  $('ov').classList.add('on');
  $('again').addEventListener('click', roll);
}
function closeOv(){$('ov').classList.remove('on');}
$('ov').addEventListener('click',function(e){if(e.target===$('ov'))closeOv();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeOv();});
$('dice').addEventListener('click',roll);
[].slice.call(document.querySelectorAll('.tab')).forEach(function(b){
  b.onclick=function(){
    [].slice.call(document.querySelectorAll('.tab')).forEach(function(x){x.classList.remove('on');});
    b.classList.add('on'); tab=b.dataset.t; apply();
  };
});
['fg','fd','fi','fu','fs','fo'].forEach(function(i){$(i).addEventListener('input',apply);});
apply();
</script>`;

  fs.writeFileSync(APP + 'mockup-browse.html', html, 'utf8');
  fs.writeFileSync(APP + 'data/films.json', JSON.stringify(all.map(f => ({
    key: f.key, imdbId: f.resolved ? f.key : null, title: f.t, year: f.y,
    seen: f.seen, wl: f.wl, top1000: f.top1000, votes: f.votes
  }))), 'utf8');
  console.log('\nunique films in store:', counts.all.toLocaleString(), '| unresolved letterboxd rows:', unresolved);
  console.log('tabs:', JSON.stringify(counts));
  console.log('nouvelle vague core period (' + NV_FROM + '-' + NV_TO + '):', nvCore, 'of', counts.nv);
})();
