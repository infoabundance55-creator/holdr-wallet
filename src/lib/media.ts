import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1024px)';

function subscribe(fn: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}

/** True on desktop-width screens (the 2-column / table layouts). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
