/**
 * Sign in with Apple or Google through Supabase. Uses the secure system
 * browser sheet, which works in Expo Go: the provider's page opens, the user
 * approves, and the phone receives a one-time code it swaps for a session.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { useAuthStore } from '@/store/authStore';
import { clearLocalAccountData, syncNow } from '@/sync/appSync';
import { getSupabase } from './supabase';

export type Provider = 'apple' | 'google';

/** Where the provider sends people back to. Must be in Supabase's allowed redirect list. */
export function authRedirectUrl(): string {
  return Linking.createURL('auth-callback');
}

export type SignInResult = { ok: true } | { ok: false; cancelled?: boolean; error?: string };

export async function signInWith(provider: Provider): Promise<SignInResult> {
  const db = getSupabase();
  if (!db) return { ok: false, error: 'Accounts aren’t set up yet.' };
  const redirectTo = authRedirectUrl();
  const { data, error } = await db.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, error: error?.message ?? 'Couldn’t start sign-in.' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, cancelled: true };

  const url = new URL(result.url);
  const providerError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (providerError) return { ok: false, error: providerError };
  const code = url.searchParams.get('code');
  if (!code) return { ok: false, error: 'Sign-in didn’t finish. Please try again.' };

  const exchanged = await db.auth.exchangeCodeForSession(code);
  if (exchanged.error) return { ok: false, error: exchanged.error.message };
  return { ok: true };
}

/** Send anything still waiting, then sign out and clear this phone. */
export async function signOut(): Promise<void> {
  const db = getSupabase();
  await syncNow().catch(() => {});
  await db?.auth.signOut().catch(() => {});
  clearLocalAccountData();
}

/** Permanently delete the account and everything in it, then clear this phone. */
export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: 'Accounts aren’t set up yet.' };
  const { error } = await db.rpc('delete_my_account');
  if (error) return { ok: false, error: 'Couldn’t delete your account. Check your connection and try again.' };
  await db.auth.signOut().catch(() => {});
  clearLocalAccountData();
  return { ok: true };
}

/** Mirror the Supabase session into the app and sync when someone signs in. Returns a stop function. */
export function startAuth(): () => void {
  const db = getSupabase();
  const auth = useAuthStore.getState();
  if (!db) {
    auth.setSignedOut();
    return () => {};
  }
  const { data } = db.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      const meta = session.user.user_metadata ?? {};
      useAuthStore.getState().setSignedIn({
        userId: session.user.id,
        email: session.user.email ?? null,
        name: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
        provider: (session.user.app_metadata?.provider as string | undefined) ?? null,
      });
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') syncNow().catch(() => {});
    } else {
      useAuthStore.getState().setSignedOut();
    }
  });
  return () => data.subscription.unsubscribe();
}
