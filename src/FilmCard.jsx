import { RT_FRESH } from './constants.js';

// Module level, never nested in another render — a nested component remounts on
// every keystroke and destroys focus and state.
export default function FilmCard({ film, removed, onRemove, onRestore }) {
  const stars = v => v == null ? null : '★'.repeat(Math.floor(v)) + (v % 1 ? '½' : '');

  return (
    <article className={'card' + (removed ? ' gone' : '')}>
      <div className="poster">
        {film.p
          ? <img loading="lazy" src={film.p} alt="" />
          : <div className="poster-fallback">{film.t}</div>}
        {removed
          ? <button className="restore" onClick={() => onRestore(film.k)}>Restore</button>
          : <button className="remove" title="Remove from database" onClick={() => onRemove(film.k)}>&times;</button>}
      </div>

      <div className="body">
        <div className="flags">
          {film.s ? <span className="flag seen">Seen</span> : null}
          {film.w && !film.s ? <span className="flag wl">Watchlist</span> : null}
          {film.nvc ? <span className="flag nv">Nouvelle Vague</span> : null}
          {film.bong ? <span className="flag bong">Bong Joon Ho</span> : null}
          {film.top && !film.s ? <span className="flag top">Top 1000</span> : null}
        </div>

        <h3>{film.t}</h3>

        <div className="meta">
          {film.y || <span className="unknown">&mdash;</span>}
          {' · '}
          {film.r ? film.r + 'm' : <span className="unknown">&mdash;</span>}
          {' · '}
          {film.d || <span className="unknown">&mdash;</span>}
        </div>

        <div className="genres">
          {film.g.length
            ? film.g.map(g => <span key={g}>{g}</span>)
            : <span className="unknown">no genre data</span>}
        </div>

        <div className="scores">
          {film.i != null
            ? <span className="imdb">IMDb {film.i.toFixed(1)}</span>
            : <span className="unknown">IMDb &mdash;</span>}
          {film.rt != null
            ? <span className={'rt ' + (film.rt >= RT_FRESH ? 'fresh' : 'rotten')}>RT {film.rt}%</span>
            : <span className="unknown">RT &mdash;</span>}
          {film.mc != null ? <span className="mc">MC {film.mc}</span> : null}
        </div>

        <div className="you">
          {film.m
            ? <span className="mine">You {stars(film.m)}</span>
            : <span className="none">{film.s ? 'Watched, not rated' : 'Not seen'}</span>}
          {film.f
            ? <span className="friend">{film.f.w} {stars(film.f.r)}</span>
            : <span className="none">No friend rating</span>}
        </div>
      </div>
    </article>
  );
}
