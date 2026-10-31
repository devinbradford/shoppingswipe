import type { Product } from '@/domain/types';

/**
 * The URL a "Buy now" tap opens.
 *
 * Today it's the retailer's own product page. In Phase 4 this becomes a call
 * to a server-side link rewriter (Supabase Edge Function) that adds affiliate
 * tracking, so no affiliate secrets ever live in the app. Every outbound buy
 * link must go through this function.
 */
export function outboundUrl(product: Product): string {
  return product.productUrl;
}
