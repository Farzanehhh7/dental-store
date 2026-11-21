import { sanitizeSpreadsheetCell } from './csv';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5000; // Maximum data rows per import (excluding header)

type ExcelCellValue =
  | string
  | number
  | boolean
  | Date
  | { richText?: Array<{ text: string }> }
  | { result?: unknown }
  | { formula?: string; result?: unknown }
  | { text?: string; hyperlink?: string }
  | null
  | undefined;

export interface SpreadsheetReadOptions {
  maxBytes?: number;
  maxRows?: number;
}

async function loadExcelJs() {
  const mod = await import('exceljs');
  return ((mod as unknown as { default?: typeof mod }).default ?? mod);
}

function extractCellString(rawValue: unknown): string {
  if (rawValue === null || rawValue === undefined) return '';
  if (rawValue instanceof Date) return rawValue.toISOString();
  if (typeof rawValue === 'object') {
    const val = rawValue as ExcelCellValue & Record<string, unknown>;
    if (Array.isArray(val.richText)) {
      return val.richText.map((part) => String(part?.text ?? '')).join('');
    }
    if ('formula' in val && typeof val.formula === 'string') {
      const rawFormula = val.formula.startsWith('=') ? val.formula : `=${val.formula}`;
      return rawFormula;
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result);
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text;
    }
  }
  return String(rawValue);
}

function formatSizeLimitError(maxBytes: number): Error {
  const mb = Math.max(1, Math.round((maxBytes / (1024 * 1024)) * 10) / 10);
  return new Error(`حجم فایل بیش از سقف مجاز (${mb} مگابایت) است.`);
}

function formatRowLimitError(maxRows: number): Error {
  return new Error(`تعداد ردیف‌های فایل بیش از سقف مجاز (${maxRows} ردیف داده) است.`);
}

export async function rowsToXlsxBuffer(
  rows: Record<string, unknown>[],
  sheetName: string,
  orderedKeys?: string[]
): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  const safeSheetName = sheetName.slice(0, 31) || 'Sheet1';
  const worksheet = workbook.addWorksheet(safeSheetName);

  const keys =
    orderedKeys && orderedKeys.length > 0
      ? orderedKeys
      : rows.length > 0
        ? Object.keys(rows[0])
        : [];

  if (keys.length > 0) {
    worksheet.columns = keys.map((key) => ({ header: key, key }));
    for (const row of rows) {
      const sanitizedRow: Record<string, unknown> = {};
      for (const key of keys) {
        sanitizedRow[key] = sanitizeSpreadsheetCell(row[key]);
      }
      worksheet.addRow(sanitizedRow);
    }
  }

  return workbook.xlsx.writeBuffer();
}

export async function exportRowsToXlsx(
  rows: Record<string, unknown>[],
  sheetName: string,
  filename: string,
  orderedKeys?: string[]
): Promise<void> {
  const buffer = await rowsToXlsxBuffer(rows, sheetName, orderedKeys);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsvToMatrix(text: string, opts: SpreadsheetReadOptions = {}): string[][] {
  const maxBytes = opts.maxBytes ?? MAX_IMPORT_FILE_BYTES;
  const maxRows = opts.maxRows ?? MAX_IMPORT_ROWS;

  if (BufferOrUtf8ByteLength(text) > maxBytes) {
    throw formatSizeLimitError(maxBytes);
  }

  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  const pushCurrentRow = () => {
    row.push(current.trim());
    if (row.some((cell) => cell !== '')) {
      if (rows.length >= maxRows + 1) {
        throw formatRowLimitError(maxRows);
      }
      rows.push(row);
    }
    row = [];
    current = '';
  };

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(current.trim());
      current = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && cleaned[i + 1] === '\n') {
        i += 1;
      }
      pushCurrentRow();
    } else {
      current += ch;
    }
  }

  pushCurrentRow();
  return rows;
}

function BufferOrUtf8ByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).byteLength;
  }
  return str.length * 2;
}

/**
 * Streaming CSV reader for Web File / ReadableStream<Uint8Array>, capping both
 * total byte size and row count on-the-fly without buffering oversized uploads.
 */
export async function streamCsvReadableToMatrix(
  stream: ReadableStream<Uint8Array>,
  opts: SpreadsheetReadOptions = {}
): Promise<string[][]> {
  const maxBytes = opts.maxBytes ?? MAX_IMPORT_FILE_BYTES;
  const maxRows = opts.maxRows ?? MAX_IMPORT_ROWS;
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;
  let pendingQuote = false;
  let pendingCr = false;
  let stripBom = true;
  let totalBytes = 0;

  const flushRow = () => {
    row.push(current.trim());
    if (row.some((cell) => cell !== '')) {
      if (rows.length >= maxRows + 1) {
        throw formatRowLimitError(maxRows);
      }
      rows.push(row);
    }
    row = [];
    current = '';
  };

  const feedChunk = (chunkText: string) => {
    let text = chunkText;
    if (stripBom && text.length > 0) {
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }
      stripBom = false;
    }

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];

      if (pendingCr) {
        pendingCr = false;
        if (ch === '\n') {
          continue;
        }
      }

      if (pendingQuote) {
        pendingQuote = false;
        if (ch === '"') {
          current += '"';
          continue;
        } else {
          inQuotes = false;
          // Fall through to handle `ch` outside quotes
        }
      }

      if (inQuotes) {
        if (ch === '"') {
          pendingQuote = true;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\r') {
        pendingCr = true;
        flushRow();
      } else if (ch === '\n') {
        flushRow();
      } else {
        current += ch;
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw formatSizeLimitError(maxBytes);
        }
        feedChunk(decoder.decode(value, { stream: true }));
      }
    }
    const tail = decoder.decode();
    if (tail) {
      feedChunk(tail);
    }
    if (pendingQuote) {
      inQuotes = false;
      pendingQuote = false;
    }
    flushRow();
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }

  return rows;
}

export async function parseXlsxBufferToMatrix(
  buffer: ArrayBuffer | Uint8Array,
  opts: SpreadsheetReadOptions = {}
): Promise<string[][]> {
  const maxBytes = opts.maxBytes ?? MAX_IMPORT_FILE_BYTES;
  const maxRows = opts.maxRows ?? MAX_IMPORT_ROWS;

  if (buffer.byteLength > maxBytes) {
    throw formatSizeLimitError(maxBytes);
  }

  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  const loadInput: ArrayBuffer =
    buffer instanceof Uint8Array
      ? new Uint8Array(buffer).buffer
      : buffer;
  await workbook.xlsx.load(loadInput);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values : [];
    const cols: string[] = [];
    for (let c = 1; c < values.length; c += 1) {
      cols.push(extractCellString(values[c]).trim());
    }
    while (cols.length > 0 && cols[cols.length - 1] === '') {
      cols.pop();
    }
    if (cols.length > 0) {
      if (matrix.length >= maxRows + 1) {
        throw formatRowLimitError(maxRows);
      }
      matrix.push(cols);
    }
  });

  return matrix;
}

export async function readSpreadsheetToMatrix(
  file: File,
  opts: SpreadsheetReadOptions = {}
): Promise<string[][]> {
  const maxBytes = opts.maxBytes ?? MAX_IMPORT_FILE_BYTES;
  if (file.size > maxBytes) {
    throw formatSizeLimitError(maxBytes);
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.csv') || file.type.includes('csv') || file.type === 'text/plain') {
    if (typeof file.stream === 'function') {
      return streamCsvReadableToMatrix(file.stream(), opts);
    }
    const text = await file.text();
    return parseCsvToMatrix(text, opts);
  }

  const buffer = await file.arrayBuffer();
  return parseXlsxBufferToMatrix(buffer, opts);
}
