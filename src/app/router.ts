// Hash routes, so GitHub Pages never needs server rewrites:
// #/plan, #/recipes, #/recipe/<id>, #/cook/<id>, #/shopping, #/pantry,
// #/settings, #/settings/<section>, #/onboarding, #/data

import { useEffect, useState } from 'preact/hooks';

export interface Route {
  name: string;
  param?: string;
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, q = ''] = raw.split('?');
  const [name = 'plan', param] = path.split('/').filter(Boolean);
  return { name: name || 'plan', param: param ? decodeURIComponent(param) : undefined, query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string): void {
  location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}

export function back(fallback = 'plan'): void {
  if (history.length > 1) history.back();
  else go(fallback);
}
