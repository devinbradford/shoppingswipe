/**
 * Public app configuration. Only these two values may ever ship in the app.
 * Service-role keys and retailer/affiliate credentials live in Supabase Edge
 * Function secrets, never here.
 *
 * Set them in a local `.env` file (see `.env.example`). `.env` is git-ignored.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
} as const;

export const isSupabaseConfigured = env.supabaseUrl.length > 0 && env.supabasePublishableKey.length > 0;
