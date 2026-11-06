const formatters = new Map<string, Intl.NumberFormat>();

/** 12900 + "USD" -> "$129". Shows cents only when there are some. */
export function formatPrice(priceCents: number, currency = 'USD'): string {
  const hasCents = priceCents % 100 !== 0;
  const key = `${currency}:${hasCents}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f.format(priceCents / 100);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "just now", "5 min ago", "2 h ago", "3 days ago". */
export function timeAgo(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** "Halden · Northpine Supply", or just the store when there's no separate brand (common in real feeds). */
export function brandLine(brand: string | undefined, store: string | undefined): string {
  const b = (brand ?? '').trim();
  const s = (store ?? '').trim();
  if (!b || b.toLowerCase() === s.toLowerCase()) return s;
  return s ? `${b} · ${s}` : b;
}
