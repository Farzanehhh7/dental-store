const FORMULA_LEADING_PATTERN = /^[=+\-@\t\r]/;

/**
 * Neutralize spreadsheet CSV/XLSX formula injection (=, +, -, @, tab, CR).
 * Plain numeric values remain untouched when typed as JS numbers; strings with
 * formula-triggering prefixes get a leading apostrophe.
 */
export function sanitizeSpreadsheetCell(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }
  const str = String(value);
  if (str.length > 0 && FORMULA_LEADING_PATTERN.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function escapeCsvCell(value: unknown): string {
  const safe = sanitizeSpreadsheetCell(value);
  const str = safe === null || safe === undefined ? '' : String(safe);
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildCsvContent(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const bodyLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  return `\uFEFF${[headerLine, ...bodyLines].join('\n')}`;
}

export function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<unknown>>): void {
  const csv = buildCsvContent(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
