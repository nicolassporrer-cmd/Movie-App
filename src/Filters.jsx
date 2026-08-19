import { SORTS, RUNTIME_MAX } from './constants.js';

export default function Filters({ data, filters, setFilters, count, onShuffle, hasProviders }) {
  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  return (
    <div className="filters">
      <input
        className="search"
        type="search"
        placeholder="Search title or director…"
        value={filters.query}
        onChange={e => set('query', e.target.value)}
      />

      <label>Genre
        <select value={filters.genre} onChange={e => set('genre', e.target.value)}>
          <option value="">All</option>
          {data.genres.map(g => <option key={g}>{g}</option>)}
        </select>
      </label>

      <label>Director
        <select value={filters.director} onChange={e => set('director', e.target.value)}>
          <option value="">All</option>
          {data.directors.map(d => <option key={d}>{d}</option>)}
        </select>
      </label>

      <label>Min IMDb <span className="val">{filters.minImdb.toFixed(1)}</span>
        <input type="range" min="0" max="10" step="0.1"
          value={filters.minImdb}
          onChange={e => set('minImdb', +e.target.value)} />
      </label>

      <label>Min RT <span className="val">{filters.minRt}%</span>
        <input type="range" min="0" max="100" step="5"
          value={filters.minRt}
          onChange={e => set('minRt', +e.target.value)} />
      </label>

      <label>Max runtime <span className="val">{filters.maxRuntime}m</span>
        <input type="range" min="60" max={RUNTIME_MAX} step="5"
          value={filters.maxRuntime}
          onChange={e => set('maxRuntime', +e.target.value)} />
      </label>

      <label>Sort by
        <select value={filters.sort} onChange={e => set('sort', e.target.value)}>
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>

      <label className="check">
        <input type="checkbox" checked={filters.friendOnly}
          onChange={e => set('friendOnly', e.target.checked)} />
        Friend-rated only
      </label>

      {hasProviders ? (
        <label className="check">
          <input type="checkbox" checked={filters.streamingOnly}
            onChange={e => set('streamingOnly', e.target.checked)} />
          On my services
        </label>
      ) : null}

      <button className="dice" onClick={onShuffle}>🎲 Pick one for me</button>
      <span className="count">{count.toLocaleString()} {count === 1 ? 'film' : 'films'}</span>
    </div>
  );
}
