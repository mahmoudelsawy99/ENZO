import type { Doc } from './local-database';

const SECRET = new Set(['passwordHash', 'passwordSalt', 'passwordIterations']);

export async function workbookBlob(collections: Record<string, Doc[]>): Promise<Blob> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const names = Object.keys(collections);
  for (const name of names) {
    const rows = collections[name] ?? [];
    const flat = rows.map((row) => flatten(row));
    const sheet = XLSX.utils.json_to_sheet(flat.length > 0 ? flat : [{ info: 'empty' }]);
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
  }
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function rowsToXlsx(sheetName: string, rows: Array<Record<string, string | number>>): Promise<Blob> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ info: 'empty' }]);
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function flatten(row: Doc): Record<string, string | number | boolean> {
  const flat: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SECRET.has(key)) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      flat[key] = value;
    } else if (value == null) {
      flat[key] = '';
    } else {
      flat[key] = JSON.stringify(value);
    }
  }
  return flat;
}
