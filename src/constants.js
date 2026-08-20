// Every tunable value lives here. Nothing configurable is written inline elsewhere.

/* The Directors / Bong Joon Ho / Nouvelle Vague tabs were removed for a cleaner
   header. Their films are all still in the library — reachable from All films,
   from the director dropdown, and still badged on the cards. Only the tabs went. */
export const TABS = [
  { id: 'all', label: 'All films' },
  { id: 'seen', label: 'Seen' },
  { id: 'watchlist', label: 'To watch' },
  { id: 'discover', label: 'Unseen top 1000' },
  { id: 'removed', label: 'Removed' }
];

export const SORTS = [
  { id: 'imdb', label: 'IMDb' },
  { id: 'rt', label: 'Rotten Tomatoes' },
  { id: 'friend', label: 'Friend rating' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'year', label: 'Year' },
  { id: 'title', label: 'Title' }
];

export const RUNTIME_MAX = 300;
export const SUBS_KEY = 'movieapp.subscriptions.v1';
export const REGION = 'FR';
// TMDB does not expose deep links into the provider, only its own watch page.
export const TMDB_WATCH_URL = tid => 'https://www.themoviedb.org/movie/' + tid + '/watch?locale=' + REGION;

// Only the countries the VPN suggestions actually use — a full ISO table would be
// dead weight for a dozen codes.
const COUNTRY_NAMES = {
  FR: 'France', CA: 'Canada', GB: 'the UK', DE: 'Germany', NL: 'the Netherlands',
  BE: 'Belgium', CH: 'Switzerland', ES: 'Spain', IT: 'Italy', AU: 'Australia',
  IE: 'Ireland', JP: 'Japan', US: 'the US', AT: 'Austria', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', PT: 'Portugal', PL: 'Poland',
  BR: 'Brazil', MX: 'Mexico', IN: 'India', KR: 'South Korea', NZ: 'New Zealand'
};
export const countryName = cc => COUNTRY_NAMES[cc] || cc;
export const PAGE_SIZE = 90;          // cards rendered per batch; more load on scroll
export const TOAST_MS = 6000;
export const RT_FRESH = 60;           // at or above this an RT score reads as fresh
export const STORE_KEY = 'movieapp.excluded.v1';

export const DEFAULT_FILTERS = {
  genre: '',
  director: '',
  minImdb: 0,
  minRt: 0,
  maxRuntime: RUNTIME_MAX,
  friendOnly: false,
  streamingOnly: false,
  query: '',
  sort: 'imdb'
};

// Which films belong to which tab. One place, so a tab can never disagree with a count.
export function inTab(film, tab, isRemoved) {
  if (isRemoved) return tab === 'removed';
  switch (tab) {
    case 'all': return true;
    case 'seen': return !!film.s;
    case 'watchlist': return !!film.w && !film.s;
    case 'discover': return !!film.top && !film.s;
    case 'removed': return false;
    default: return false;
  }
}
