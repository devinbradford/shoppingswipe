import { Redirect } from 'expo-router';

/**
 * Apple/Google send people back to this address after signing in. The sign-in
 * code is picked up by the browser sheet in `lib/auth.ts`; if the app is opened
 * here directly (some Android browsers do this), just go to the account screen.
 */
export default function AuthCallback() {
  return <Redirect href="/account" />;
}
