import ExcelJS from 'exceljs';

type ExcelCellValue =
  | string
  | number
  | boolean
  | Date
  | { richText?: Array<{ text: string }> }
  | { result?: unknown }
  | { text?: string; hyperlink?: string }
  | null
  | undefined;

function extractCellString(rawValue: unknown): string {
  if (rawValue === null || rawValue === undefined) return '';
  if (rawValue instanceof Date) return rawValue.toISOString();
  if (typeof rawValue === 'object') {
    const val = rawValue as ExcelCellValue & Record<string, unknown>;
    if (Array.isArray(val.richText)) {
      return val.richText.map((part) => String(part?.text ?? '')).join('');
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

export async function rowsToXlsxBuffer(
  rows: Record<string, unknown>[],
  sheetName: string
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const safeSheetName = sheetName.slice(0, 31) || 'Sheet1';
  const worksheet = workbook.addWorksheet(safeSheetName);

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    worksheet.columns = keys.map((key) => ({ header: key, key }));
    for (const row of rows) {
      worksheet.addRow(row);
    }
  }

  return workbook.xlsx.writeBuffer();
}

export async function exportRowsToXlsx(
  rows: Record<string, unknown>[],
  sheetName: string,
  filename: string
): Promise<void> {
  const buffer = await rowsToXlsxBuffer(rows, sheetName);
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

export function parseCsvToMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

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
      row.push(current.trim());
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }

  row.push(current.trim());
  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }

  return rows;
}

export async function parseXlsxBufferToMatrix(buffer: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values : [];
    const cols: string[] = [];
    for (let c = 1; c < values.length; c += 1) {
      cols.push(extractCellString(values[c]));
    }
    while (cols.length > 0 && cols[cols.length - 1] === '') {
      cols.pop();
    }
    if (cols.length > 0) {
      matrix.push(cols);
    }
  });

  return matrix;
}

export async function readSpreadsheetToMatrix(file: File): Promise<string[][]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.csv') || file.type.includes('csv') || file.type === 'text/plain') {
    const text = await file.text();
    return parseCsvToMatrix(text);
  }
  const buffer = await file.arrayBuffer();
  return parseXlsxBufferToMatrix(buffer);
}
