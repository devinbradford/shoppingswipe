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
