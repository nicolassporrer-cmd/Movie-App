/* Multi-select genres, matched as a union: Crime + Thriller + Drama shows films in
   ANY of them, not only films in all three. Intersection would be near-useless here
   — barely a handful of films carry three specific genres at once, whereas the union
   is how someone actually thinks about "what am I in the mood for". */
export default function GenrePicker({ genres, counts, selected, onToggle, onClear, open, setOpen }) {
  if (!genres.length) return null;
  const n = selected.size;

  return (
    <div className="genrep">
      <button className={'genrep-toggle' + (n ? ' on' : '')} onClick={() => setOpen(!open)}>
        {n ? 'Genres (' + n + ')' : 'Any genre'}
        <span className="chev">{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className="genrep-panel">
          <p className="genrep-help">
            Tick as many as you like &mdash; a film matching <strong>any</strong> of them is shown.
          </p>
          <div className="genrep-list">
            {genres.map(g => (
              <label key={g} className={'chip' + (selected.has(g) ? ' on' : '')}>
                <input type="checkbox" checked={selected.has(g)} onChange={() => onToggle(g)} />
                {g}
                <span className="chip-count">{counts[g] || 0}</span>
              </label>
            ))}
          </div>
          {n ? <button className="subs-clear" onClick={onClear}>Clear genres</button> : null}
        </div>
      ) : null}
    </div>
  );
}
