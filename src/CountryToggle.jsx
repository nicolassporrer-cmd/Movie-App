/* Nicolas splits his time between the US and France. Switching country recomputes
   green, pink and grey entirely client-side — the data for both ships with the app,
   so there is no reload and no refetch. */
const FLAGS = { US: '🇺🇸', FR: '🇫🇷', GB: '🇬🇧', DE: '🇩🇪', CA: '🇨🇦' };
const NAMES = { US: 'United States', FR: 'France', GB: 'United Kingdom', DE: 'Germany', CA: 'Canada' };

export default function CountryToggle({ countries, value, onChange, counts }) {
  if (!countries || countries.length < 2) return null;

  return (
    <div className="country">
      <span className="country-label">I&rsquo;m in</span>
      {countries.map(cc => {
        const c = (counts && counts[cc]) || {};
        return (
          <button
            key={cc}
            className={'country-btn' + (cc === value ? ' on' : '')}
            onClick={() => onChange(cc)}
            title={NAMES[cc] || cc}
          >
            <span className="flag">{FLAGS[cc] || cc}</span>
            {NAMES[cc] || cc}
            {c.green != null ? <span className="country-count">{c.green} direct</span> : null}
          </button>
        );
      })}
    </div>
  );
}
