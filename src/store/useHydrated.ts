import { useSyncExternalStore } from 'react';

import { useSwipeStore } from './swipeStore';

const subscribe = (onChange: () => void) => useSwipeStore.persist.onFinishHydration(onChange);
const getSnapshot = () => useSwipeStore.persist.hasHydrated();

/** True once the saved swipe log has been loaded from device storage. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
