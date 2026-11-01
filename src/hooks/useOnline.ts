import { useNetworkState } from 'expo-network';

/**
 * False only when we know the device is offline. Unknown (still checking)
 * counts as online so we never flash an offline warning at startup.
 */
export function useOnline(): boolean {
  const state = useNetworkState();
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}
