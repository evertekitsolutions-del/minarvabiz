/** Shared strict quoted CSV reader. Preserves the existing product/customer import parser semantics. */
export function parseCsvRecord(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === ",") {
      cols.push(current.trim());
      current = "";
      closedQuote = false;
      continue;
    }
    if (ch === '"') {
      // Only an empty field (or whitespace before its opening quote) can
      // begin a quoted value. A quote in plain text or after a closing
      // quote otherwise silently changes imported customer/product names.
      if (closedQuote || current.trim()) {
        throw new Error("Unexpected quote in CSV field");
      }
      current = "";
      quoted = true;
      continue;
    }
    if (closedQuote && !/\s/.test(ch)) {
      throw new Error("Characters after closing CSV quote");
    }
    current += ch;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  cols.push(current.trim());
  return cols;
}


/** Parse records (not physical lines) so a quoted product name may contain CRLF. */
export function readCsvRecords(source: string): Array<{ text: string; line: number }> {
  const records: Array<{ text: string; line: number }> = [];
  let quoted = false, current = "", startLine = 1, line = 1;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      current += ch;
      if (quoted && source[i + 1] === '"') {
        current += source[++i];
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      if (quoted) current += "\n";
      else {
        if (current.trim()) records.push({ text: current, line: startLine });
        current = "";
        startLine = line + 1;
      }
      line += 1;
      continue;
    }
    current += ch;
  }
  if (quoted) throw new Error("Row " + startLine + ": Unclosed quoted CSV field");
  if (current.trim()) records.push({ text: current, line: startLine });
  return records;
}

