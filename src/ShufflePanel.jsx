import { useEffect } from 'react';
import { RT_FRESH } from './constants.js';

export default function ShufflePanel({ pick, total, onRoll, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel">
        {!pick ? (
          <>
            <h2>Nothing to pick from</h2>
            <p className="sub">Every film is filtered out. Widen a filter and roll again.</p>
            <div className="actions"><button onClick={onClose}>Close</button></div>
          </>
        ) : (
          <>
            <h2>{pick.t}</h2>
            <p className="sub">
              {pick.y || '—'} · {pick.r ? pick.r + ' min' : '—'} · {pick.d || '—'}
            </p>
            <div className="panel-row">
              <div className="panel-poster">
                {pick.p ? <img src={pick.p} alt="" /> : null}
              </div>
              <div>
                <p className="panel-genres">{pick.g.join(', ') || '—'}</p>
                <p className="panel-scores">
                  <strong>{pick.i != null ? 'IMDb ' + pick.i.toFixed(1) : 'IMDb —'}</strong>
                  {pick.rt != null
                    ? <span className={pick.rt >= RT_FRESH ? 'fresh' : 'rotten'}> · RT {pick.rt}%</span>
                    : null}
                </p>
                <p className="panel-note">
                  Picked from the {total.toLocaleString()} films matching your current filters.
                </p>
              </div>
            </div>
            <div className="actions">
              <button className="primary" onClick={onRoll}>Roll again</button>
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
