/**
 * Small, dependency-free CSV reader (RFC 4180): quoted fields, doubled quotes,
 * commas and line breaks inside quotes, CRLF, and a leading byte-order mark.
 *
 * Built for big feeds (Awin files unzip to ~36 MB) inside Supabase's tight CPU and
 * memory limits: it jumps between delimiters with indexOf and slices fields out of
 * the text, instead of building strings one character at a time.
 */
export function parseCsv(
  text: string,
  delimiter = ',',
  /** Return false to drop a row early (e.g. other stores' rows in a combined feed). */
  keep?: (row: Record<string, string>) => boolean,
): Record<string, string>[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: Record<string, string>[] = [];
  let header: string[] | null = null;
  for (const record of records(source, delimiter)) {
    if (!header) {
      header = record.map((h) => h.trim());
      continue;
    }
    if (record.length <= 1 && (record[0] ?? '').trim() === '') continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = record[i] ?? '';
    if (!keep || keep(row)) out.push(row);
  }
  return out;
}

function* records(text: string, delimiter: string): Generator<string[]> {
  const n = text.length;
  let pos = 0;
  // Next positions of each separator, refreshed only once we pass them (keeps this linear).
  let nextDelim = -1;
  let nextNl = -1;
  let nextCr = -1;
  const find = (ch: string, cached: number) => (cached >= pos || cached === n ? cached : seek(text, ch, pos, n));

  while (pos < n) {
    const row: string[] = [];
    for (;;) {
      let field: string;
      if (text[pos] === '"') {
        // Quoted: runs to the next quote that isn't doubled.
        let end = pos + 1;
        let doubled = false;
        for (;;) {
          const q = text.indexOf('"', end);
          if (q < 0) {
            end = n;
            break;
          }
          if (text[q + 1] === '"') {
            doubled = true;
            end = q + 2;
            continue;
          }
          end = q;
          break;
        }
        field = text.slice(pos + 1, end);
        if (doubled) field = field.replace(/""/g, '"');
        pos = Math.min(n, end + 1);
        // Anything between the closing quote and the next separator belongs to the field.
        nextDelim = find(delimiter, nextDelim);
        nextNl = find('\n', nextNl);
        nextCr = find('\r', nextCr);
        const stop = Math.min(nextDelim, nextNl, nextCr);
        if (stop > pos) {
          field += text.slice(pos, stop);
          pos = stop;
        }
      } else {
        nextDelim = find(delimiter, nextDelim);
        nextNl = find('\n', nextNl);
        nextCr = find('\r', nextCr);
        const stop = Math.min(nextDelim, nextNl, nextCr);
        field = text.slice(pos, stop);
        pos = stop;
      }
      row.push(field);
      if (pos >= n) break;
      const c = text[pos];
      if (c === delimiter) {
        pos++;
        if (pos >= n) {
          row.push('');
          break;
        }
        continue;
      }
      // End of record: \n, \r or \r\n.
      pos += c === '\r' && text[pos + 1] === '\n' ? 2 : 1;
      break;
    }
    yield row;
  }
}

function seek(text: string, ch: string, from: number, n: number): number {
  const i = text.indexOf(ch, from);
  return i < 0 ? n : i;
}
