import { useState } from 'react';

import { deleteAccount, signInWith, signOut, type Provider } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuthStore } from '@/store/authStore';
import { useOutboxStore } from '@/store/outboxStore';
import { syncNow } from '@/sync/appSync';

/** Everything the Account screen needs: who's signed in, sync status and the actions. */
export function useAccount() {
  const auth = useAuthStore();
  const pending = useOutboxStore((s) => s.queue.length);
  const lastSyncedAt = useOutboxStore((s) => s.lastSyncedAt);
  const offline = useOutboxStore((s) => s.offline);
  const [busy, setBusy] = useState<Provider | 'sync' | 'signOut' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async <T>(what: typeof busy, fn: () => Promise<T>) => {
    setBusy(what);
    setError(null);
    try {
      return await fn();
    } finally {
      setBusy(null);
    }
  };

  return {
    configured: isSupabaseConfigured,
    ...auth,
    pending,
    lastSyncedAt,
    offline,
    busy,
    error,
    signIn: (p: Provider) =>
      run(p, async () => {
        const r = await signInWith(p);
        if (!r.ok && !r.cancelled) setError(r.error ?? 'Sign-in didn’t work. Please try again.');
        return r.ok;
      }),
    syncNow: () => run('sync', () => syncNow()),
    signOut: () => run('signOut', () => signOut()),
    deleteAccount: () =>
      run('delete', async () => {
        const r = await deleteAccount();
        if (!r.ok) setError(r.error ?? 'Couldn’t delete your account.');
        return r.ok;
      }),
  };
}
