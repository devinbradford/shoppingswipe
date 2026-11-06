/** Text clean-up for feed fields. */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

/** Common UTF-8-read-as-Windows-1252 garbling ("jeansâ€”" → "jeans—"). */
const MOJIBAKE: [string, string][] = [
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€™', '’'],
  ['â€˜', '‘'],
  ['â€œ', '“'],
  ['â€\u009d', '”'],
  ['â€', '”'],
  ['Â ', ' '],
  ['Â', ''],
];

/** Strips HTML, decodes entities, repairs garbled punctuation, and collapses whitespace. */
export function cleanText(raw: string | undefined): string {
  let t = (raw ?? '').replace(/<[^>]*>/g, ' ');
  t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
  for (const [bad, good] of MOJIBAKE) t = t.split(bad).join(good);
  return t.replace(/\s+/g, ' ').trim();
}

/** Shortens text at a sentence or word boundary. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}

export interface SplitName {
  /** "Maui Braided Rug in Black". */
  title: string;
  /** "Gray" from "… - Gray / 5' X 8' Oval", else null. */
  colour: string | null;
  /** "5' X 8' Oval", or ''. */
  size: string;
}

/**
 * Splits a variant name into product title, colour and size:
 * "Ridgewood Rug - Gray / 5' X 8' Oval" → title "Ridgewood Rug in Gray", colour "Gray", size "5' X 8' Oval";
 * "Maui Rug in Black - 7' X 9' Oval" → title "Maui Rug in Black", size "7' X 9' Oval".
 */
export function splitVariantName(name: string): SplitName {
  const clean = cleanText(name);
  const at = clean.lastIndexOf(' - ');
  if (at < 0) return { title: clean, colour: null, size: '' };
  const head = clean.slice(0, at).trim();
  const tail = clean.slice(at + 3).trim();
  if (tail.includes('/')) {
    const [colour, ...rest] = tail.split('/');
    const base = head.replace(/\s+in (multiple sizes( & shapes)?|\d+ sizes)\b/i, '').trim();
    return { title: `${base} in ${colour.trim()}`, colour: colour.trim(), size: rest.join('/').trim() };
  }
  // Only treat the tail as a size when it looks like one; otherwise it's part of the name.
  if (looksLikeSize(tail)) return { title: head, colour: null, size: tail };
  return { title: clean, colour: null, size: '' };
}

function looksLikeSize(t: string): boolean {
  return /\d\s*['"]|\d+\s*(x|×)\s*\d|\b(round|oval|runner|square|twin|full|queen|king|cal(ifornia)? king|small|medium|large)\b/i.test(
    t,
  );
}

/** Floor area in square feet from a size like "5' X 8'" or "7'6\" x 9'6\""; null when there isn't one. */
export function sizeArea(size: string): number | null {
  const m = size.match(/(\d+(?:\.\d+)?)\s*'?\s*(?:(\d+)\s*")?\s*[x×]\s*(\d+(?:\.\d+)?)\s*'?\s*(?:(\d+)\s*")?/i);
  if (!m) {
    const round = size.match(/(\d+(?:\.\d+)?)\s*'\s*round/i);
    if (round) {
      const d = Number(round[1]);
      return Math.PI * (d / 2) ** 2;
    }
    return null;
  }
  const w = Number(m[1]) + Number(m[2] ?? 0) / 12;
  const l = Number(m[3]) + Number(m[4] ?? 0) / 12;
  return w * l;
}
