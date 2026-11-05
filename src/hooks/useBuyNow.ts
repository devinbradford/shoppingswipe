import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';

import type { Product } from '@/domain/types';
import { outboundUrl } from '@/lib/outboundLink';
import { recordSignal } from '@/store/signalStore';
import { useOnline } from './useOnline';

/**
 * Opens a product on the store's site (always through `outboundUrl`), records the
 * buy signal, and reports a plain-language problem if it can't.
 */
export function useBuyNow() {
  const online = useOnline();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = useCallback(
    async (product: Product, storeName = 'the store') => {
      setError(null);
      if (!online) {
        setError(`You're offline. Connect to the internet to open ${storeName}.`);
        return;
      }
      setOpening(true);
      recordSignal(product.id, 'buy_click');
      try {
        await WebBrowser.openBrowserAsync(outboundUrl(product));
      } catch {
        setError(`Couldn't open ${storeName}. Try again in a moment.`);
      } finally {
        setOpening(false);
      }
    },
    [online],
  );

  return { buy, opening, error, clearError: () => setError(null) };
}
