/**
 * "Did you buy it?" rules. Pure: no React, no storage.
 */

export interface Purchase {
  productId: string;
  /** Epoch milliseconds when they told us. */
  at: number;
}

/** Ask at most once per product, and never about something already marked bought. */
export function canAskAboutPurchase(productId: string, bought: readonly Purchase[], asked: readonly string[]): boolean {
  return !asked.includes(productId) && !bought.some((b) => b.productId === productId);
}

/** Remember that we asked (keeps the newest 500 so storage stays small). */
export function markAsked(asked: readonly string[], productId: string): string[] {
  return [...asked.filter((id) => id !== productId), productId].slice(-500);
}

export function addPurchase(bought: readonly Purchase[], productId: string, at: number): Purchase[] {
  return bought.some((b) => b.productId === productId) ? [...bought] : [{ productId, at }, ...bought];
}
