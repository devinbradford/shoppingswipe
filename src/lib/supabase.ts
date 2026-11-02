import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

/**
 * Supabase client, or null while the backend isn't configured (Phase 1–2).
 * Created lazily so the app runs fine with no `.env`.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE: the sign-in page hands back a one-time code that only this phone can redeem.
        flowType: 'pkce',
      },
    });
  }
  return client;
}
