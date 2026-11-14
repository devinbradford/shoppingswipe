/**
 * Name and page-address keys for finding one design family listed several ways in one store
 * (manifest v2 grouping rules). Pure.
 */
const NAME_STOPWORDS = new Set(['in', 'with', 'and', 'for', 'the', 'set', 'of', 'pcs', 'piece', 'a']);
const NAME_COLOURS = new Set(['walnut', 'oak', 'black', 'white', 'grey', 'gray', 'brown', 'beige', 'cream', 'natural', 'rustic', 'espresso', 'navy', 'green', 'blue', 'pink', 'gold', 'silver', 'light', 'dark', 'vintage', 'cherry', 'teak', 'ivory', 'khaki', 'tan', 'taupe', 'charcoal', 'multi']);

/**
 * A product name with colour, size, count and filler words removed, used to find listings of one
 * design family that the address rules can't see (same store, different pages). Returns '' when
 * fewer than 3 meaningful words remain (too generic to suggest the same design).
 * Example: "Cas TV Cabinet with 2-Door, Set of 2 in Grey Alder" → "cas tv cabinet door alder".
 */
export function productNameKey(title: string, extraColours: Iterable<string> = []): string {
  const colours = new Set([...NAME_COLOURS, ...[...extraColours].map((c) => c.toLowerCase())]);
  const words = title
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(in|inch|inches|ft|cm)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => w && !colours.has(w) && !/^\d+$/.test(w) && !NAME_STOPWORDS.has(w));
  return words.length >= 3 ? words.join(' ') : '';
}

/**
 * A store page address reduced the same way as `productNameKey` (host kept, words singularised,
 * colour/size/count words dropped), to catch one product listed on two near-identical pages, e.g.
 * /products/stria-round-coffee-tables-… and /products/stria-round-coffee-table-….
 */
export function pageKey(pagePath: string, extraColours: Iterable<string> = []): string {
  const slash = pagePath.indexOf('/');
  const host = slash > 0 ? pagePath.slice(0, slash) : '';
  const slug = (slash > 0 ? pagePath.slice(slash + 1) : pagePath).split('/').pop() ?? '';
  const key = productNameKey(slug.replace(/-/g, ' '), extraColours);
  return key ? `${host}|${key}` : '';
}
