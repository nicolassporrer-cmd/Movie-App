/* Lets Nicolas declare which services he pays for. Stored in localStorage, so it is
   per-device like the removals — but it is a preference rather than data, and takes
   ten seconds to redo, so that is a fair trade for needing no backend. */
export default function Subscriptions({ providers, counts, mine, onToggle, onClear, open, setOpen }) {
  if (!providers.length) return null;

  return (
    <div className="subs">
      <button className="subs-toggle" onClick={() => setOpen(!open)}>
        {mine.size ? 'My services (' + mine.size + ')' : 'Pick my services'}
        <span className="chev">{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className="subs-panel">
          <p className="subs-help">
            {mine.size
              ? <>Films on your services get a green badge, and <strong>On my services</strong> and the shuffle use them.</>
              : <><strong>Nothing picked yet</strong> &mdash; so the streaming filter currently matches <em>any</em> service, including ones you do not pay for. Tick yours below to narrow it.</>}
          </p>
          <div className="subs-list">
            {providers.map((name, i) => (
              <label key={name} className={'chip' + (mine.has(name) ? ' on' : '')}>
                <input
                  type="checkbox"
                  checked={mine.has(name)}
                  onChange={() => onToggle(name)}
                />
                {name}
                <span className="chip-count">{counts[i] || 0}</span>
              </label>
            ))}
          </div>
          {mine.size ? <button className="subs-clear" onClick={onClear}>Clear all</button> : null}
        </div>
      ) : null}
    </div>
  );
}
