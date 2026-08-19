import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import FilmCard from './FilmCard.jsx';
import Filters from './Filters.jsx';
import ShufflePanel from './ShufflePanel.jsx';
import Subscriptions from './Subscriptions.jsx';
import { TABS, DEFAULT_FILTERS, PAGE_SIZE, TOAST_MS, STORE_KEY, SUBS_KEY, RUNTIME_MAX, inTab } from './constants.js';

/* Removal is an exclusion list, never a delete: the dataset is regenerated from
   the IMDb datasets, so a deleted row would reappear on the next build. */
function loadExcluded() {
  try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveExcluded(set) {
  // Array.from, not [].slice.call — a Set has no length and slice would write []
  try { localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(set))); } catch { /* private mode */ }
}
function loadSubs() {
  try { return new Set(JSON.parse(localStorage.getItem(SUBS_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveSubs(set) {
  try { localStorage.setItem(SUBS_KEY, JSON.stringify(Array.from(set))); } catch { /* private mode */ }
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [excluded, setExcluded] = useState(loadExcluded);
  const [mine, setMine] = useState(loadSubs);
  const [subsOpen, setSubsOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [toast, setToast] = useState(null);
  const [shuffle, setShuffle] = useState(null);
  const undoRef = useRef(null);
  const timerRef = useRef(null);
  const sentinel = useRef(null);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/films.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        setData(d);
        // Seed the known subscriptions on a device that has never been set up.
        // Guarded on the key being absent entirely, not empty — clearing every
        // service is a deliberate choice and must not be undone on reload.
        if (localStorage.getItem(SUBS_KEY) === null && (d.defaultSubs || []).length) {
          const seeded = new Set(d.defaultSubs);
          setMine(seeded);
          saveSubs(seeded);
        }
      })
      .catch(e => setError(e.message));
  }, []);

  const showToast = useCallback((message, undo) => {
    undoRef.current = undo;
    setToast(message);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const setRemoved = useCallback((key, on) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      saveExcluded(next);
      return next;
    });
  }, []);

  const remove = useCallback((key) => {
    const film = data.films.find(f => f.k === key);
    setRemoved(key, true);
    showToast('Removed "' + (film ? film.t : key) + '"', () => setRemoved(key, false));
  }, [data, setRemoved, showToast]);

  const restore = useCallback((key) => {
    const film = data.films.find(f => f.k === key);
    setRemoved(key, false);
    showToast('Restored "' + (film ? film.t : key) + '"', () => setRemoved(key, true));
  }, [data, setRemoved, showToast]);

  // Counts must be derived, never baked in — anything removable changes them live.
  const counts = useMemo(() => {
    if (!data) return {};
    const out = Object.fromEntries(TABS.map(t => [t.id, 0]));
    data.films.forEach(f => {
      const gone = excluded.has(f.k);
      if (gone) { out.removed++; return; }
      TABS.forEach(t => { if (t.id !== 'removed' && inTab(f, t.id, false)) out[t.id]++; });
    });
    return out;
  }, [data, excluded]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = filters.query.trim().toLowerCase();
    const rows = data.films.filter(f => {
      const gone = excluded.has(f.k);
      if (!inTab(f, tab, gone)) return false;
      if (filters.genre && !f.g.includes(filters.genre)) return false;
      // match against the full credit list (da) where one exists, not the truncated display
      if (filters.director && !((f.da || f.d || '').includes(filters.director))) return false;
      if (filters.minImdb > 0 && !(f.i != null && f.i >= filters.minImdb)) return false;
      if (filters.minRt > 0 && !(f.rt != null && f.rt >= filters.minRt)) return false;
      if (filters.maxRuntime < RUNTIME_MAX && !(f.r != null && f.r <= filters.maxRuntime)) return false;
      if (filters.friendOnly && !f.f) return false;
      if (filters.streamingOnly) {
        if (!f.pv || !f.pv.length) return false;
        // With no subscriptions declared, "streaming" means any service rather than none
        if (mine.size && !f.pv.some(i => mine.has(data.providers[i]))) return false;
      }
      if (q && !(f.t.toLowerCase().includes(q) || (f.da || f.d || '').toLowerCase().includes(q))) return false;
      return true;
    });
    const by = {
      imdb: (a, b) => (b.i ?? -1) - (a.i ?? -1),
      rt: (a, b) => (b.rt ?? -1) - (a.rt ?? -1),
      friend: (a, b) => (b.f ? b.f.r : -1) - (a.f ? a.f.r : -1),
      runtime: (a, b) => (a.r ?? 1e9) - (b.r ?? 1e9),
      year: (a, b) => (b.y ?? 0) - (a.y ?? 0),
      title: (a, b) => a.t.localeCompare(b.t)
    };
    return rows.sort(by[filters.sort] || by.imdb);
  }, [data, tab, filters, excluded, mine]);

  const providerCounts = useMemo(() => {
    if (!data || !data.providers) return {};
    const out = {};
    data.films.forEach(f => (f.pv || []).forEach(i => { out[i] = (out[i] || 0) + 1; }));
    return out;
  }, [data]);

  const toggleSub = useCallback(name => {
    setMine(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      saveSubs(next);
      return next;
    });
  }, []);

  useEffect(() => { setLimit(PAGE_SIZE); }, [tab, filters]);

  // Incremental rendering: 2,253 cards at once is slow on a phone.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setLimit(l => Math.min(l + PAGE_SIZE, visible.length));
    }, { rootMargin: '600px' });
    io.observe(node);
    return () => io.disconnect();
  }, [visible.length]);

  const roll = useCallback(() => {
    if (!visible.length) { setShuffle({ pick: null }); return; }
    setShuffle({ pick: visible[Math.floor(Math.random() * visible.length)] });
  }, [visible]);

  if (error) return <div className="wrap"><h1>Movies</h1><p className="err">Could not load the film data: {error}</p></div>;
  if (!data) return <div className="wrap"><h1>Movies</h1><p className="loading">Loading the library…</p></div>;

  return (
    <div className="wrap">
      {/* The photo is a CSS background, so a missing file falls back to the
          gradient underneath rather than showing a broken image. */}
      <header className="hero">
        <div className="hero-inner">
          <h1>Nico&rsquo;s Movies App</h1>
          <p className="build">
            {data.counts.all.toLocaleString()} films · {data.counts.withRt.toLocaleString()} with Rotten Tomatoes
            · {data.counts.withPoster.toLocaleString()} with a poster
          </p>
          <p className="build built-at">Data built {data.builtAt}</p>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id}
            className={'tab' + (tab === t.id ? ' active' : '') + (t.id === 'removed' ? ' removed-tab' : '')}
            onClick={() => setTab(t.id)}>
            {t.label} <span className="tab-count">({(counts[t.id] || 0).toLocaleString()})</span>
          </button>
        ))}
      </nav>

      <Filters data={data} filters={filters} setFilters={setFilters}
        count={visible.length} onShuffle={roll} hasProviders={!!(data.providers || []).length}
        mineCount={mine.size} onNeedServices={() => setSubsOpen(true)} />

      <Subscriptions
        providers={data.providers || []}
        counts={providerCounts}
        mine={mine}
        onToggle={toggleSub}
        onClear={() => { setMine(new Set()); saveSubs(new Set()); }}
        regions={data.providerRegions || {}}
        open={subsOpen}
        setOpen={setSubsOpen}
      />

      {visible.length === 0 ? (
        <p className="empty">
          <strong>Nothing matches these filters.</strong><br />
          Widen a slider, clear the genre, or reset the search.
        </p>
      ) : (
        <>
          <div className="grid">
            {visible.slice(0, limit).map(f => (
              <FilmCard key={f.k} film={f} removed={excluded.has(f.k)}
                onRemove={remove} onRestore={restore}
                providers={data.providers || []} mine={mine} />
            ))}
          </div>
          <div ref={sentinel} className="sentinel">
            {limit < visible.length ? 'Loading more…' : null}
          </div>
        </>
      )}

      {toast ? (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => { if (undoRef.current) undoRef.current(); setToast(null); }}>Undo</button>
        </div>
      ) : null}

      {shuffle ? (
        <ShufflePanel pick={shuffle.pick} total={visible.length}
          onRoll={roll} onClose={() => setShuffle(null)}
          providers={data.providers || []} mine={mine} />
      ) : null}

      {/* Required attribution for the TMDB and OMDb data */}
      <footer className="credits">
        Film data from <a href="https://www.imdb.com/interfaces/" target="_blank" rel="noopener noreferrer">IMDb&rsquo;s public datasets</a>.
        Ratings and posters via <a href="https://www.omdbapi.com/" target="_blank" rel="noopener noreferrer">OMDb</a>.
        Streaming availability{data.providersAt ? ' (as of ' + data.providersAt + ')' : ''} via JustWatch,
        served through the TMDB API. This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </div>
  );
}
