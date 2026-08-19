/* Builds mockup-browse.html from real sources only.
   NO invented metadata: anything unknown renders as an explicit dash. */
const fs = require('fs'), zlib = require('zlib'), readline = require('readline');
const D = 'C:/dev/_letterboxd_data/';
const OUT = 'C:/dev/Movie-App/mockup-browse.html';
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

  const DIRS = JSON.parse(fs.readFileSync('C:/dev/Movie-App/data/top50-directors.json', 'utf8'));
  const dirIds = new Set(DIRS.map(d => d.id));

  const rat = new Map();
  fs.readFileSync(D + 'ratings.tsv', 'utf8').split('\n').forEach((l, i) => {
    if (!i) return; const p = l.split('\t'); if (p.length < 3) return;
    rat.set(p[0], { r: +p[1], v: +p[2] });
  });
  console.log('rated titles:', rat.size.toLocaleString());

  // basics: MOVIES only. Without this filter the top of the ratings file is TV episodes.
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
  console.log('movies with credited director:', crew.size.toLocaleString());

  const byDirector = new Map();
  crew.forEach((ds, tid) => { if (ds.some(d => dirIds.has(d))) byDirector.set(tid, ds.filter(d => dirIds.has(d))); });
  console.log('films by the top-50 directors:', byDirector.size.toLocaleString());

  const topPool = [...byId.values()].filter(m => { const r = rat.get(m.id); return r && r.v >= MIN_VOTES; })
    .map(m => Object.assign({}, m, rat.get(m.id)))
    .sort((a, b) => b.r - a.r || b.v - a.v);
  const top = topPool.slice(0, TOP_N);

  const selected = new Set(top.map(m => m.id));
  byDirector.forEach((_, id) => selected.add(id));
  const lbIds = new Map();
  [...watched, ...wl].forEach(r => {
    const id = byTitle.get(norm(r.Name) + '|' + r.Year);
    if (id) { lbIds.set(norm(r.Name) + '|' + r.Year, id); selected.add(id); }
  });

  const needed = new Set();
  selected.forEach(id => (crew.get(id) || []).forEach(n => needed.add(n)));
  const nameOf = new Map();
  await new Promise(res => {
    const rl = stream('names.tsv.gz');
    rl.on('line', l => { const p = l.split('\t'); if (needed.has(p[0])) nameOf.set(p[0], p[1]); });
    rl.on('close', res);
  });
  console.log('director names resolved:', nameOf.size.toLocaleString());

  const dirNames = id => (crew.get(id) || []).map(n => nameOf.get(n)).filter(Boolean).slice(0, 2).join(', ') || null;
  const enrich = id => {
    const m = byId.get(id); if (!m) return null;
    const r = rat.get(id);
    return { runtime: m.runtime, genres: m.genres, imdb: r ? r.r : null, votes: r ? r.v : null, dir: dirNames(id) };
  };

  const watchedLoose = new Set(watched.map(r => norm(r.Name)));
  const wlLoose = new Set(wl.map(r => norm(r.Name)));
  const rows = [];
  const push = (title, year, status, id, extra) => {
    const e = id ? enrich(id) : null;
    rows.push(Object.assign({
      t: title, y: year || null, status: status,
      runtime: e ? e.runtime : null, genres: e ? e.genres : [], imdb: e ? e.imdb : null,
      votes: e ? e.votes : null, dir: e ? e.dir : null,
      p: poster[norm(title) + '|' + year] || null, fr: friend[norm(title) + '|' + year] || null,
      resolved: !!id, mine: null, onWl: false, who: null
    }, extra || {}));
  };

  watched.forEach(r => push(r.Name, r.Year, 'seen', lbIds.get(norm(r.Name) + '|' + r.Year), { mine: myRating[norm(r.Name) + '|' + r.Year] || null }));
  wl.forEach(r => push(r.Name, r.Year, 'towatch', lbIds.get(norm(r.Name) + '|' + r.Year), {}));

  const unseenTop = top.filter(m => !watchedLoose.has(norm(m.title)) && !watchedLoose.has(norm(m.orig)));
  unseenTop.forEach(m => push(m.title, m.year, 'discover', m.id, { onWl: wlLoose.has(norm(m.title)) }));

  const dirRows = [];
  byDirector.forEach((ds, id) => {
    const m = byId.get(id);
    if (!m || watchedLoose.has(norm(m.title))) return;
    dirRows.push({ m: m, v: (rat.get(id) || { v: 0 }).v, who: ds.map(n => nameOf.get(n)).filter(Boolean).join(', ') });
  });
  dirRows.sort((a, b) => b.v - a.v);
  dirRows.forEach(x => push(x.m.title, x.m.year, 'directors', x.m.id, { onWl: wlLoose.has(norm(x.m.title)), who: x.who }));

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DASH = '<span class="unk">&mdash;</span>';
  const stars = v => v == null ? '' : '\u2605'.repeat(Math.floor(v)) + (v % 1 ? '\u00bd' : '');
  const allGen = [...new Set(rows.flatMap(r => r.genres))].sort();

  const card = f => [
    '<article class="c" data-s="', f.status, '" data-g="', esc(f.genres.join('|')),
    '" data-imdb="', (f.imdb == null ? -1 : f.imdb), '" data-run="', (f.runtime == null ? -1 : f.runtime),
    '" data-y="', (f.y || 0), '" data-fr="', (f.fr ? 1 : 0), '" data-frv="', (f.fr ? f.fr.r : 0),
    '" data-dir="', esc(f.dir || ''), '" data-t="', esc(f.t), '">',
    '<div class="p">', f.p ? '<img loading="lazy" src="' + f.p + '" alt="">' : '<div class="ph">' + esc(f.t) + '</div>', '</div>',
    '<div class="b">',
    f.onWl ? '<div class="flag">On your watchlist</div>' : '',
    f.who ? '<div class="flag dirflag">' + esc(f.who) + '</div>' : '',
    '<h3>', esc(f.t), '</h3>',
    '<div class="mt">', (f.y || DASH), ' \u00b7 ', (f.runtime ? f.runtime + 'm' : DASH), ' \u00b7 ', (f.dir ? esc(f.dir) : DASH), '</div>',
    '<div class="ch">', (f.genres.length ? f.genres.map(g => '<span>' + esc(g) + '</span>').join('') : '<span class="unk">no genre data</span>'), '</div>',
    '<div class="rt">', (f.imdb != null ? '<span class="im">IMDb ' + f.imdb.toFixed(1) + '</span>' : '<span class="unk">IMDb &mdash;</span>'),
    '<span class="unk">RT &mdash;</span></div>',
    '<div class="you">',
    (f.mine ? '<span class="ys">You ' + stars(f.mine) + '</span>' : (f.status === 'seen' ? '<span class="nu">Watched, not rated</span>' : '<span class="nu">Not seen</span>')),
    (f.fr ? '<span class="fs">' + esc(f.fr.who) + ' ' + stars(f.fr.r) + '</span>' : '<span class="nf">No friend rating</span>'),
    '</div></div></article>'
  ].join('');

  const counts = { seen: watched.length, towatch: wl.length, discover: unseenTop.length, directors: dirRows.length };
  const resolvedSeen = rows.filter(r => r.status === 'seen' && r.resolved).length;

  const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Movie-App Mockup v3</title>
<style>
:root{--bg:#fbfaf9;--fg:#1a1a1a;--mut:#6b6b6b;--card:#fff;--bd:#e5e2df;--acc:#00A85A;--pur:#6b4cff;--info:#0a5a8a;--infobg:#e3f1fa}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141414;--fg:#ededed;--mut:#9a9a9a;--card:#1e1e1e;--bd:#333;--pur:#a48cff;--info:#7cc4ee;--infobg:#10293a}}
:root[data-theme=dark]{--bg:#141414;--fg:#ededed;--mut:#9a9a9a;--card:#1e1e1e;--bd:#333;--pur:#a48cff;--info:#7cc4ee;--infobg:#10293a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.w{max-width:1180px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--mut);font-size:13px;margin-bottom:14px}
.info{background:var(--infobg);color:var(--info);border:1px solid currentColor;border-radius:8px;padding:11px 14px;font-size:13px;margin-bottom:18px;line-height:1.55}
.tabs{display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--bd);flex-wrap:wrap}
.tab{padding:9px 15px;border:0;background:none;color:var(--mut);font:inherit;font-weight:600;cursor:pointer;border-bottom:2px solid transparent}
.tab.on{color:var(--fg);border-bottom-color:var(--acc)}
.f{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;padding:12px 14px;background:var(--card);border:1px solid var(--bd);border-radius:10px;margin-bottom:16px}
.f label{font-size:11.5px;color:var(--mut);display:flex;flex-direction:column;gap:3px}
select,input[type=range]{font:inherit;font-size:13px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg)}
select{padding:4px 6px;max-width:170px}
input[type=range]{width:112px;padding:0;accent-color:var(--acc)}
.chk{flex-direction:row!important;align-items:center;gap:5px;font-size:12.5px;color:var(--fg)}
.dice{padding:9px 18px;border:0;border-radius:8px;background:var(--acc);color:#fff;font:inherit;font-weight:700;cursor:pointer;font-size:14px}
.cnt{margin-left:auto;font-size:13px;color:var(--mut);align-self:center}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:14px}
.c{background:var(--card);border:1px solid var(--bd);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.p{aspect-ratio:2/3;background:#8881;overflow:hidden}
.p img{width:100%;height:100%;object-fit:cover;display:block}
.ph{width:100%;height:100%;display:grid;place-items:center;text-align:center;padding:10px;font-size:12px;color:var(--mut)}
.b{padding:9px 10px 11px;display:flex;flex-direction:column;gap:6px;flex:1}
h3{font-size:13.5px;margin:0;line-height:1.3}
.mt{font-size:11.5px;color:var(--mut)}
.flag{font-size:10px;font-weight:700;color:var(--acc);letter-spacing:.03em;text-transform:uppercase}
.dirflag{color:var(--pur);text-transform:none;font-size:10.5px}
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
<div class="sub">Mockup v3 &middot; every value is real or explicitly blank &mdash; nothing is invented</div>
<div class="info"><strong>Real:</strong> title, year, runtime, genres, director and IMDb score come from IMDb's official datasets. Your ratings and posters come from your export and RSS feed.<br>
<strong>Blank (&mdash;):</strong> Rotten Tomatoes everywhere &mdash; needs an OMDb key. Posters exist only for the ~50 films in the RSS window; the rest need TMDB.<br>
<strong>Matched:</strong> ${resolvedSeen} of your ${watched.length} watched films resolved against IMDb; the rest show &mdash; because no confident title+year match exists.</div>
<div class="tabs">
<button class="tab on" data-t="seen">Seen (${counts.seen})</button>
<button class="tab" data-t="towatch">To Watch (${counts.towatch})</button>
<button class="tab" data-t="discover">Discover &mdash; unseen top ${TOP_N} (${counts.discover})</button>
<button class="tab" data-t="directors">Top-50 directors (${counts.directors})</button>
</div>
<div class="f">
<label>Genre<select id="fg"><option value="">All</option>${allGen.map(g => '<option>' + esc(g) + '</option>').join('')}</select></label>
<label>Director<select id="fd"><option value="">All</option>${DIRS.map(d => '<option>' + esc(d.name) + '</option>').join('')}</select></label>
<label>Min IMDb <span id="li">0.0</span><input type="range" id="fi" min="0" max="10" step="0.1" value="0"></label>
<label>Max runtime <span id="lu">300m</span><input type="range" id="fu" min="60" max="300" step="5" value="300"></label>
<label>Sort by<select id="fs"><option value="imdb">IMDb</option><option value="t">Title</option><option value="frv">Friend rating</option><option value="run">Runtime</option><option value="y">Year</option></select></label>
<label class="chk"><input type="checkbox" id="fo"> Friend-rated only</label>
<button class="dice" id="dice">&#127922; Pick one for me</button>
<span class="cnt" id="cnt"></span>
</div>
<div class="g" id="g">${rows.map(card).join('')}</div>
<div class="empty" id="e"><p><strong>Nothing matches these filters.</strong></p><p>Widen a slider, or clear the genre.</p></div>
</div>
<div class="ov" id="ov"><div class="pick" id="pick"></div></div>
<script>
var D = [].slice.call(document.querySelectorAll('.c')).map(function(el){
  return {el:el, t:el.dataset.t, s:el.dataset.s, g:el.dataset.g, imdb:+el.dataset.imdb,
    run:+el.dataset.run, y:+el.dataset.y, fr:+el.dataset.fr, frv:+el.dataset.frv, dir:el.dataset.dir};
});
var tab='seen', shown=[];
function $(i){return document.getElementById(i);}
function apply(){
  var g=$('fg').value,d=$('fd').value,i=+$('fi').value,u=+$('fu').value,s=$('fs').value,o=$('fo').checked;
  $('li').textContent=i.toFixed(1); $('lu').textContent=u+'m';
  shown=[];
  D.forEach(function(f){
    var ok = f.s===tab
      && (!g || f.g.split('|').indexOf(g)>-1)
      && (!d || f.dir.indexOf(d)>-1)
      && (i===0 || (f.imdb>=0 && f.imdb>=i))
      && (u===300 || (f.run>=0 && f.run<=u))
      && (!o || f.fr);
    f.el.style.display = ok ? '' : 'none';
    if(ok) shown.push(f);
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
  var el=f.el, img=el.querySelector('img');
  var gen=[].slice.call(el.querySelectorAll('.ch span')).map(function(x){return x.textContent;}).join(', ');
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

  fs.writeFileSync(OUT, html, 'utf8');
  console.log('\npool(>=' + MIN_VOTES + ' votes):', topPool.length, '| top' + TOP_N + ' floor:', top[top.length - 1].r);
  console.log('tabs -> seen:', counts.seen, 'towatch:', counts.towatch, 'discover:', counts.discover, 'directors:', counts.directors);
  console.log('seen films resolved against IMDb:', resolvedSeen, '/', watched.length);
  console.log('total cards:', rows.length);
})();
