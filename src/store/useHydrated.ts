import { useSyncExternalStore } from 'react';

import { useSwipeStore } from './swipeStore';
import { useWishlistStore } from './wishlistStore';

const stores = [useSwipeStore, useWishlistStore];

const subscribe = (onChange: () => void) => {
  const unsubs = stores.map((s) => s.persist.onFinishHydration(onChange));
  return () => unsubs.forEach((u) => u());
};
const getSnapshot = () => stores.every((s) => s.persist.hasHydrated());

/** True once everything saved on this device (swipes, kept items, lists) has loaded. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
