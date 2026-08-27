import { useEffect } from 'react';
import { RT_FRESH, countryName } from './constants.js';

/* One panel for two jobs: the dice's pick, and clicking any card. They showed the
   same information, so keeping two components meant every change had to be made
   twice — which is exactly how the VPN badge ended up on cards but not in the
   shuffle for a week. `roll` is what differs: present for the dice, absent for a
   card click. */
export default function FilmPanel({ film, total, onRoll, onClose, providers = [], mine = new Set(), country = 'US' }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stars = v => v == null ? null : '★'.repeat(Math.floor(v)) + (v % 1 ? '½' : '');

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel">
        {!film ? (
          <>
            <h2>Nothing to pick from</h2>
            <p className="sub">Every film is filtered out. Widen a filter and roll again.</p>
            <div className="actions"><button onClick={onClose}>Close</button></div>
          </>
        ) : (
          <>
            <h2>{film.t}</h2>
            <p className="sub">
              {film.y || '—'} · {film.r ? film.r + ' min' : '—'} · {film.da || film.d || '—'}
            </p>

            <div className="panel-row">
              <div className="panel-poster">
                {film.p ? <img src={film.p} alt="" /> : null}
              </div>

              <div className="panel-main">
                {/* Only rendered when it exists — no filler, same rule as everywhere else */}
                {film.sy ? <p className="panel-synopsis">{film.sy}</p> : null}

                <p className="panel-genres">{film.g.join(', ') || '—'}</p>

                <p className="panel-scores">
                  <strong>{film.i != null ? 'IMDb ' + film.i.toFixed(1) : 'IMDb —'}</strong>
                  {film.rt != null
                    ? <span className={film.rt >= RT_FRESH ? 'fresh' : 'rotten'}> · RT {film.rt}%</span>
                    : null}
                  {film.mc != null ? <span className="mc"> · Metacritic {film.mc}</span> : null}
                </p>

                {(film.m || film.f) ? (
                  <p className="panel-you">
                    {film.m ? <span className="mine">You {stars(film.m)}</span> : null}
                    {film.m && film.f ? ' · ' : null}
                    {film.f ? <span className="friend">{film.f.w} {stars(film.f.r)}</span> : null}
                  </p>
                ) : null}

                {(() => {
                  const on = ((film.av && film.av[country]) || []).map(i => providers[i]).filter(Boolean);
                  const alt = film.alt && film.alt[country];
                  const subscribed = on.filter(n => mine.has(n));
                  if (subscribed.length) return <p className="panel-watch on-mine">▶ Watch now on {subscribed.join(', ')}</p>;
                  if (alt && mine.has(providers[alt[0]])) {
                    return (
                      <p className="panel-watch on-vpn">
                        ⇄ On your {providers[alt[0]]} in {countryName(alt[1])} &mdash; needs the VPN
                      </p>
                    );
                  }
                  if (on.length) return <p className="panel-watch on-other">Streaming on {on.join(', ')}</p>;
                  return <p className="panel-watch on-other">Not on any subscription service</p>;
                })()}

                {onRoll ? (
                  <p className="panel-note">
                    Picked from the {total.toLocaleString()} films matching your current filters.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="actions">
              {onRoll ? <button className="primary" onClick={onRoll}>Roll again</button> : null}
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
