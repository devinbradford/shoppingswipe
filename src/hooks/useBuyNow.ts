import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';

import type { Product } from '@/domain/types';
import { outboundUrl } from '@/lib/outboundLink';
import { useSnapshotStore } from '@/store/productSnapshotStore';
import { usePurchaseStore } from '@/store/purchaseStore';
import { recordSignal } from '@/store/signalStore';

/** Buy now, from anywhere: goes through the short "Taking you to…" moment (`/handoff/[id]`). */
export function useBuyNow() {
  const buy = useCallback((product: Product) => {
    router.push({ pathname: '/handoff/[id]', params: { id: product.id } });
  }, []);
  return { buy };
}

/** On Android the store opens in its own window; wait until they're back in CureAvo. */
function backInApp(): Promise<void> {
  return new Promise((resolve) => {
    let left = false;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') left = true;
      else if (left) {
        sub.remove();
        resolve();
      }
    });
    // If the app never seemed to leave, don't wait forever.
    setTimeout(() => {
      if (!left) {
        sub.remove();
        resolve();
      }
    }, 4000);
  });
}

/**
 * Opens the store's page in a browser sheet over the app (always through `outboundUrl`),
 * records the Buy now signal, and once they're back queues "Did you buy it?".
 * Throws if the browser couldn't open.
 */
export async function visitStore(product: Product, storeName: string): Promise<void> {
  recordSignal(product.id, 'buy_click');
  // If they come back and say they bought it, Kept shows it from this copy should the store stop selling it.
  useSnapshotStore.getState().remember(product, storeName);
  const result = await WebBrowser.openBrowserAsync(outboundUrl(product), {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    dismissButtonStyle: 'close',
  });
  // iOS resolves when the sheet is closed; Android (and web) right after opening.
  if (result.type === 'opened' && Platform.OS === 'android') await backInApp();
  usePurchaseStore.getState().returnedFrom({ productId: product.id, title: product.title, storeName });
}
