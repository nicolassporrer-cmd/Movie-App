import { RT_FRESH, TMDB_WATCH_URL, countryName } from './constants.js';

// Module level, never nested in another render — a nested component remounts on
// every keystroke and destroys focus and state.
export default function FilmCard({ film, removed, onRemove, onRestore, providers, mine, country }) {
  const stars = v => v == null ? null : '★'.repeat(Math.floor(v)) + (v % 1 ? '½' : '');
  // Availability depends on where he is: the same film is green in one country,
  // pink in the other, grey in neither.
  const on = ((film.av && film.av[country]) || []).map(i => providers[i]).filter(Boolean);
  const alt = film.alt && film.alt[country];
  // A service you pay for is the useful signal; the rest is context.
  const subscribed = on.filter(n => mine.has(n));
  const others = on.filter(n => !mine.has(n));

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
          {film.d
            ? <>
                {film.d}
                {/* Anthologies credit several directors. Showing only the first two
                    made a Tarantino search return Grindhouse with his name nowhere
                    on the card, which reads as a bug rather than a co-credit. */}
                {film.da
                  ? <span className="more-dirs" title={'All credited directors: ' + film.da}>
                      {' +' + Math.max(1, film.da.split(', ').length - 2)}
                    </span>
                  : null}
              </>
            : <span className="unknown">&mdash;</span>}
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

        <div className="watch">
          {subscribed.length ? (
            <span className="on-mine" title={'Included with ' + subscribed.join(', ')}>
              ▶ {subscribed.join(', ')}
            </span>
          ) : alt && mine.has(providers[alt[0]]) ? (
            /* On a service he pays for, but only in another country — a VPN hop away.
               Pink, deliberately distinct from the green "just press play" case. */
            <span className="on-vpn" title={'On your ' + providers[alt[0]] + ' in ' + countryName(alt[1]) + ' — needs a VPN'}>
              ⇄ {providers[alt[0]]} · {alt[1]}
            </span>
          ) : others.length ? (
            <span className="on-other" title={'Streaming on ' + others.join(', ')}>
              {others.slice(0, 2).join(', ')}{others.length > 2 ? ' +' + (others.length - 2) : ''}
            </span>
          ) : film.tid ? (
            <a className="where" href={TMDB_WATCH_URL(film.tid, country)} target="_blank" rel="noopener noreferrer">
              Not streaming &middot; where to watch
            </a>
          ) : (
            <span className="none">Streaming unknown</span>
          )}
        </div>
      </div>
    </article>
  );
}
