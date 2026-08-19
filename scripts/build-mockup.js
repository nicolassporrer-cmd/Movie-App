const fs = require('fs'), zlib = require('zlib'), readline = require('readline');
const D = 'C:/dev/_letterboxd_data/';
const MIN_VOTES = 50000, TOP_N = 500;

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

const watched = csv('watched.csv'), ratings = csv('ratings.csv'), wl = csv('watchlist.csv');
const rmap = {}; ratings.forEach(r => rmap[r.Name + '|' + r.Year] = +r.Rating);
const mine = rss('nico_spo'), reg = rss('Regelegorila');
const poster = {}; [...mine, ...reg].forEach(i => { if (i.poster) poster[i.title + '|' + i.year] = i.poster; });
const friend = {}; reg.forEach(i => { if (i.rating) friend[i.title + '|' + i.year] = { who: 'Regelegorila', r: +i.rating }; });

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const wLoose = new Set(watched.map(w => norm(w.Name)));
const wlLoose = new Set(wl.map(w => norm(w.Name)));

const rat = new Map();
fs.readFileSync(D + 'ratings.tsv', 'utf8').split('\n').forEach((l, i) => {
  if (!i) return; const p = l.split('\t'); if (p.length < 3) return;
  const v = +p[2]; if (v >= MIN_VOTES) rat.set(p[0], { r: +p[1], v: v });
});

const pool = [];
const rl = readline.createInterface({ input: fs.createReadStream(D + 'basics.tsv.gz').pipe(zlib.createGunzip()), crlfDelay: Infinity });
rl.on('line', l => {
  const p = l.split('\t'); const h = rat.get(p[0]);
  if (!h || p[1] !== 'movie') return;
  pool.push({ title: p[2], year: +p[5] || null, runtime: +p[7] || null, genres: p[8] === '\\N' ? [] : p[8].split(','), imdb: h.r, votes: h.v });
});

rl.on('close', () => {
  pool.sort((a, b) => b.imdb - a.imdb || b.votes - a.votes);
  const top = pool.slice(0, TOP_N);
  const unseen = top.filter(m => !wLoose.has(norm(m.title)));

  // Deterministic placeholders ONLY for values we cannot yet source
  const DIR = ['Bong Joon-ho', 'David Fincher', 'Christopher Nolan', 'Wes Anderson', 'Denis Villeneuve', 'Celine Sciamma', 'Park Chan-wook', 'Greta Gerwig'];
  const GEN = ['Drama', 'Thriller', 'Comedy', 'Sci-Fi', 'Crime', 'Animation', 'Romance', 'Horror', 'Documentary', 'Action'];
  function hash(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; }

  const rows = [];
  // Tab 1 + 2: from Letterboxd. IMDb/RT/genre/runtime/director are placeholders here.
  [[watched, 'seen'], [wl, 'towatch']].forEach(([src, status]) => src.forEach(r => {
    const k = r.Name + '|' + r.Year, n = hash(k);
    rows.push({
      t: r.Name, y: r.Year, status: status, real: false,
      genres: [GEN[n % GEN.length], GEN[(n >> 3) % GEN.length]],
      runtime: 88 + (n % 75), dir: DIR[(n >> 5) % DIR.length],
      imdb: (60 + (n % 38)) / 10, rt: 35 + (n % 64),
      mine: rmap[k] || null, fr: friend[k] || null, p: poster[k] || null, onWl: false
    });
  }));
  // Tab 3: from the IMDb dataset. imdb/runtime/genres/year are REAL. director/RT/poster still missing.
  unseen.forEach(m => {
    const n = hash(m.title + '|' + m.year);
    rows.push({
      t: m.title, y: m.year, status: 'discover', real: true,
      genres: m.genres.length ? m.genres.slice(0, 2) : ['—'],
      runtime: m.runtime, dir: DIR[(n >> 5) % DIR.length],
      imdb: m.imdb, rt: 35 + (n % 64), votes: m.votes,
      mine: null, fr: friend[m.title + '|' + m.year] || null, p: poster[m.title + '|' + m.year] || null,
      onWl: wlLoose.has(norm(m.title))
    });
  });

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const stars = v => v == null ? '' : '\u2605'.repeat(Math.floor(v)) + (v % 1 ? '\u00bd' : '');
  const allGen = [...new Set(rows.flatMap(r => r.genres))].filter(g => g !== '—').sort();

  const card = f => [
    '<article class="c" data-s="' + f.status + '" data-g="' + esc(f.genres.join('|')) + '" data-rt="' + f.rt + '" data-imdb="' + f.imdb + '" data-run="' + (f.runtime || 0) + '" data-y="' + (f.y || 0) + '" data-fr="' + (f.fr ? 1 : 0) + '" data-frv="' + (f.fr ? f.fr.r : 0) + '" data-dir="' + esc(f.dir) + '" data-t="' + esc(f.t) + '">',
    '<div class="p">' + (f.p ? '<img loading="lazy" src="' + f.p + '" alt="">' : '<div class="ph">' + esc(f.t) + '</div>') + '</div>',
    '<div class="b">',
    (f.onWl ? '<div class="wlflag">On your watchlist</div>' : ''),
    '<h3>' + esc(f.t) + '</h3>',
    '<div class="mt">' + (f.y || '?') + ' \u00b7 ' + (f.runtime ? f.runtime + 'm' : '?') + ' \u00b7 <span class="' + (f.real ? 'mock' : '') + '">' + esc(f.dir) + '</span></div>',
    '<div class="ch">' + f.genres.map(g => '<span' + (f.real ? '' : ' class="mock"') + '>' + esc(g) + '</span>').join('') + '</div>',
    '<div class="rt"><span class="im' + (f.real ? '' : ' mock') + '">IMDb ' + f.imdb.toFixed(1) + '</span><span class="rtm mock ' + (f.rt >= 60 ? 'fresh' : 'rot') + '">RT ' + f.rt + '%</span></div>',
    '<div class="you">' + (f.mine ? '<span class="ys">You ' + stars(f.mine) + '</span>' : (f.status === 'discover' ? '<span class="nu">Not seen</span>' : '<span class="nu">Not rated</span>')),
    (f.fr ? '<span class="fs">' + esc(f.fr.who) + ' ' + stars(f.fr.r) + '</span>' : '<span class="nf">No friend rating</span>') + '</div>',
    '</div></article>'
  ].join('');

  const html = `<title>Movie-App Mockup v2</title>
<style>
:root{--bg:#fbfaf9;--fg:#1a1a1a;--mut:#6b6b6b;--card:#fff;--bd:#e5e2df;--acc:#00A85A;--pur:#6b4cff;--warn:#7a4f00;--warnbg:#fff4dc;--ok:#0a6b3d;--okbg:#e4f5ec}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141414;--fg:#ededed;--mut:#9a9a9a;--card:#1e1e1e;--bd:#333;--pur:#a48cff;--warnbg:#3a2d10;--warn:#f0c46a;--ok:#6ee7a8;--okbg:#0f2f20}}
:root[data-theme=dark]{--bg:#141414;--fg:#ededed;--mut:#9a9a9a;--card:#1e1e1e;--bd:#333;--pur:#a48cff;--warnbg:#3a2d10;--warn:#f0c46a;--ok:#6ee7a8;--okbg:#0f2f20}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.w{max-width:1180px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--mut);font-size:13px;margin-bottom:14px}
.warn{background:var(--warnbg);color:var(--warn);border:1px solid currentColor;border-radius:8px;padding:11px 14px;font-size:13px;margin-bottom:10px;line-height:1.55}
.legend{background:var(--okbg);color:var(--ok);border:1px solid currentColor;border-radius:8px;padding:9px 14px;font-size:12.5px;margin-bottom:18px}
.tabs{display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--bd);flex-wrap:wrap}
.tab{padding:9px 15px;border:0;background:none;color:var(--mut);font:inherit;font-weight:600;cursor:pointer;border-bottom:2px solid transparent}
.tab.on{color:var(--fg);border-bottom-color:var(--acc)}
.f{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;padding:12px 14px;background:var(--card);border:1px solid var(--bd);border-radius:10px;margin-bottom:16px}
.f label{font-size:11.5px;color:var(--mut);display:flex;flex-direction:column;gap:3px}
select,input[type=range]{font:inherit;font-size:13px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg)}
select{padding:4px 6px;max-width:150px}
input[type=range]{width:112px;padding:0;accent-color:var(--acc)}
.chk{flex-direction:row!important;align-items:center;gap:5px;font-size:12.5px;color:var(--fg)}
.dice{padding:9px 18px;border:0;border-radius:8px;background:var(--acc);color:#fff;font:inherit;font-weight:700;cursor:pointer;font-size:14px}
.dice:hover{filter:brightness(1.08)}
.cnt{margin-left:auto;font-size:13px;color:var(--mut);align-self:center}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:14px}
.c{background:var(--card);border:1px solid var(--bd);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.p{aspect-ratio:2/3;background:#8881;overflow:hidden}
.p img{width:100%;height:100%;object-fit:cover;display:block}
.ph{width:100%;height:100%;display:grid;place-items:center;text-align:center;padding:10px;font-size:12px;color:var(--mut)}
.b{padding:9px 10px 11px;display:flex;flex-direction:column;gap:6px;flex:1}
h3{font-size:13.5px;margin:0;line-height:1.3}
.mt{font-size:11.5px;color:var(--mut)}
.wlflag{font-size:10px;font-weight:700;color:var(--acc);letter-spacing:.03em;text-transform:uppercase}
.ch{display:flex;gap:4px;flex-wrap:wrap}
.ch span{font-size:10.5px;padding:1.5px 6px;border:1px solid var(--bd);border-radius:99px;color:var(--mut)}
.rt{display:flex;gap:7px;font-size:11px}
.im{color:#b8901f;font-weight:600}
.rtm{font-weight:600}.rtm.fresh{color:#d2492a}.rtm.rot{color:var(--mut)}
.mock{opacity:.45;font-style:italic}
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
.pick .none{color:var(--mut);font-size:14px}
</style>
<div class="w">
<h1>Movie-App &mdash; browse, discover, shuffle</h1>
<div class="sub">Mockup v2 &middot; ${watched.length} watched &middot; ${wl.length} watchlist &middot; ${unseen.length} unseen from the IMDb top ${TOP_N}</div>
<div class="warn"><strong>Real:</strong> your titles, years, ratings, posters, Regelegorila's ratings &mdash; and on the <strong>Discover</strong> tab the IMDb score, vote count, runtime, genres and year, all from IMDb's official dataset (min ${MIN_VOTES.toLocaleString()} votes).<br>
<strong>Still mock (shown faded/italic):</strong> Rotten Tomatoes everywhere, plus genre/runtime/director/IMDb on your own two tabs. Those need TMDB + OMDb keys.<br>
<strong>There is no real "RT top 500"</strong> &mdash; Rotten Tomatoes has no public API (enterprise access starts at $60k/yr), so RT scores can only be fetched per film via OMDb.</div>
<div class="legend"><strong>Discover tab:</strong> the IMDb top ${TOP_N} minus everything you have already seen &mdash; ${unseen.length} films. Ones already on your watchlist are flagged.</div>
<div class="tabs">
<button class="tab on" data-t="seen">Seen (${watched.length})</button>
<button class="tab" data-t="towatch">To Watch (${wl.length})</button>
<button class="tab" data-t="discover">Discover &mdash; unseen top ${TOP_N} (${unseen.length})</button>
</div>
<div class="f">
<label>Genre<select id="fg"><option value="">All</option>${allGen.map(g => '<option>' + esc(g) + '</option>').join('')}</select></label>
<label>Min IMDb <span id="li">0.0</span><input type="range" id="fi" min="0" max="10" step="0.1" value="0"></label>
<label>Min RT <span id="lr">0%</span><input type="range" id="fr" min="0" max="100" step="5" value="0"></label>
<label>Max runtime <span id="lu">300m</span><input type="range" id="fu" min="60" max="300" step="5" value="300"></label>
<label>Sort by<select id="fs"><option value="t">Title</option><option value="imdb">IMDb</option><option value="frv">Friend rating</option><option value="rt">Rotten Tomatoes</option><option value="run">Runtime</option><option value="y">Year</option></select></label>
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
  return {el:el, t:el.dataset.t, s:el.dataset.s, g:el.dataset.g, rt:+el.dataset.rt, imdb:+el.dataset.imdb,
    run:+el.dataset.run, y:+el.dataset.y, fr:+el.dataset.fr, frv:+el.dataset.frv, dir:el.dataset.dir};
});
var tab='seen', shown=[];
function $(i){return document.getElementById(i);}
function apply(){
  var g=$('fg').value,i=+$('fi').value,r=+$('fr').value,u=+$('fu').value,s=$('fs').value,o=$('fo').checked;
  $('li').textContent=i.toFixed(1); $('lr').textContent=r+'%'; $('lu').textContent=u+'m';
  shown=[];
  D.forEach(function(f){
    var ok=f.s===tab&&(!g||f.g.split('|').indexOf(g)>-1)&&f.imdb>=i&&f.rt>=r&&(f.run===0||f.run<=u)&&(!o||f.fr);
    f.el.style.display=ok?'':'none';
    if(ok) shown.push(f);
  });
  shown.sort(function(a,b){return s==='t'?a.t.localeCompare(b.t):s==='run'?a.run-b.run:b[s]-a[s];});
  var G=$('g'); shown.forEach(function(f){G.appendChild(f.el);});
  $('cnt').textContent=shown.length+(shown.length===1?' film':' films');
  $('e').style.display=shown.length?'none':'block';
}
function roll(){
  var P=$('pick');
  if(!shown.length){P.innerHTML='<p class="none"><strong>Nothing to pick from.</strong><br>Every film is filtered out \\u2014 widen a filter and roll again.</p><div class="acts"><button onclick="closeOv()">Close</button></div>';$('ov').classList.add('on');return;}
  var f=shown[Math.floor(Math.random()*shown.length)];
  var el=f.el, img=el.querySelector('img'), gen=el.querySelector('.ch').textContent.trim();
  P.innerHTML='<h2>'+f.t+'</h2><div class="pm">'+(f.y||'?')+' \\u00b7 '+(f.run?f.run+' min':'? min')+' \\u00b7 '+f.dir+'</div>'+
    '<div class="row"><div class="pp">'+(img?'<img src="'+img.src+'">':'')+'</div>'+
    '<div><p style="margin:0 0 8px">'+gen+'</p><p style="margin:0"><strong>IMDb '+f.imdb.toFixed(1)+'</strong> \\u00b7 RT '+f.rt+'%</p>'+
    '<p style="margin:8px 0 0;font-size:13px;opacity:.7">Picked from the '+shown.length+' films matching your current filters.</p></div></div>'+
    '<div class="acts"><button class="pri" onclick="roll()">Roll again</button><button onclick="closeOv()">Close</button></div>';
  $('ov').classList.add('on');
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
['fg','fi','fr','fu','fs','fo'].forEach(function(i){$(i).addEventListener('input',apply);});
apply();
</script>`;

  fs.writeFileSync('C:/dev/Movie-App/mockup-browse.html', html);
  console.log('pool(>=' + MIN_VOTES + ' votes):', pool.length, '| top' + TOP_N + ' floor:', top[TOP_N - 1].imdb);
  console.log('seen of top' + TOP_N + ':', top.length - unseen.length, '| unseen:', unseen.length);
  console.log('cards total:', rows.length);
});
