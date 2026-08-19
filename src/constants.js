// Every tunable value lives here. Nothing configurable is written inline elsewhere.

export const TABS = [
  { id: 'all', label: 'All films' },
  { id: 'seen', label: 'Seen' },
  { id: 'watchlist', label: 'To watch' },
  { id: 'discover', label: 'Unseen top 1000' },
  { id: 'directors', label: 'Directors' },
  { id: 'bong', label: 'Bong Joon Ho' },
  { id: 'nv', label: 'Nouvelle Vague' },
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
    case 'directors': return !!film.dir && !film.s;
    case 'bong': return !!film.bong;
    case 'nv': return !!film.nv;
    case 'removed': return false;
    default: return false;
  }
}
