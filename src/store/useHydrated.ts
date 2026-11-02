import { useSyncExternalStore } from 'react';

import { useOutboxStore } from './outboxStore';
import { usePreferencesStore } from './preferencesStore';
import { useSwipeStore } from './swipeStore';
import { useWishlistStore } from './wishlistStore';

const stores = [useSwipeStore, useWishlistStore, usePreferencesStore, useOutboxStore];

const subscribe = (onChange: () => void) => {
  const unsubs = stores.map((s) => s.persist.onFinishHydration(onChange));
  return () => unsubs.forEach((u) => u());
};
const getSnapshot = () => stores.every((s) => s.persist.hasHydrated());

/** True once everything saved on this device (swipes, kept items, lists) has loaded. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Resolves once everything saved on this device has loaded (for code outside React, like sync). */
export function whenHydrated(): Promise<void> {
  if (getSnapshot()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = subscribe(() => {
      if (getSnapshot()) {
        off();
        resolve();
      }
    });
  });
}
