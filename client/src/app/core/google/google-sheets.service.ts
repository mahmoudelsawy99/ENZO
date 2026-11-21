import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { GoogleAuthService } from './google-auth.service';
import { headerRow } from './google-services.mapper';
import { SERVICE_SHEET_HEADERS } from './google-sheet.models';
import { USER_SHEET_HEADERS, userHeaderRow } from './google-users.mapper';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  private readonly auth = inject(GoogleAuthService);
  private readonly spreadsheetId = environment.googleSheets.spreadsheetId;
  private readonly servicesSheet = environment.googleSheets.servicesSheet;
  private readonly usersSheet = environment.googleSheets.usersSheet;
  /** Actual tab title in the spreadsheet (Google sheet names are case-insensitive). */
  private resolvedServicesTitle: string | null = null;
  private resolvedUsersTitle: string | null = null;

  async ensureServicesSheet(): Promise<void> {
    const title = await this.ensureTab(this.servicesSheet);
    this.resolvedServicesTitle = title;
    const values = await this.readServicesMatrix();
    if (values.length === 0 || !this.headersMatch(values[0] ?? [])) {
      // Clear Excel/legacy rows first — writing A1 alone left an empty-looking sync sheet.
      await this.request(`${API}/${this.spreadsheetId}/values:batchClear`, {
        method: 'POST',
        body: { ranges: [title] },
      });
      await this.writeRange(`${this.quote(title)}!A1`, [headerRow()]);
    }
  }

  async readServicesMatrix(): Promise<string[][]> {
    const title = await this.servicesTitle();
    const range = encodeURIComponent(`${this.quote(title)}!A:${columnLetter(SERVICE_SHEET_HEADERS.length)}`);
    const result = await this.request<{ values?: string[][] }>(
      `${API}/${this.spreadsheetId}/values/${range}`,
    );
    return (result.values ?? []).map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
  }

  async replaceServicesRows(rows: string[][]): Promise<void> {
    const title = await this.servicesTitle();
    const range = `${this.quote(title)}!A1`;
    await this.request(`${API}/${this.spreadsheetId}/values:batchClear`, {
      method: 'POST',
      body: { ranges: [title] },
    });
    const values = [headerRow(), ...rows];
    await this.writeRange(range, values);
  }

  async ensureUsersSheet(): Promise<void> {
    const title = await this.ensureTab(this.usersSheet);
    this.resolvedUsersTitle = title;
    const values = await this.readUsersMatrix();
    // Never wipe an Excel-uploaded users tab — only seed headers when empty.
    if (values.length === 0) {
      await this.writeRange(`${this.quote(title)}!A1`, [userHeaderRow()]);
    }
  }

  async readUsersMatrix(): Promise<string[][]> {
    const title = await this.usersTitle();
    // Read a wide range so Excel columns beyond the sync set are preserved.
    const range = encodeURIComponent(`${this.quote(title)}!A:Z`);
    const result = await this.request<{ values?: string[][] }>(
      `${API}/${this.spreadsheetId}/values/${range}`,
    );
    return (result.values ?? []).map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
  }

  async replaceUsersRows(rows: string[][]): Promise<void> {
    const title = await this.usersTitle();
    await this.request(`${API}/${this.spreadsheetId}/values:batchClear`, {
      method: 'POST',
      body: { ranges: [title] },
    });
    await this.writeRange(`${this.quote(title)}!A1`, [userHeaderRow(), ...rows]);
  }

  /**
   * Merge rows into the existing users tab. Keeps Excel rows that are not updated.
   * `rows` must follow USER_SHEET_HEADERS order (from userToRow).
   */
  async upsertUserRows(rows: string[][]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const matrix = await this.readUsersMatrix();
    const headers =
      matrix[0]?.length && matrix[0].some((cell) => cell.trim())
        ? matrix[0].map((cell) => cell.trim())
        : userHeaderRow();
    const next: string[][] = matrix.length > 0 ? [headers, ...matrix.slice(1).map((row) => [...row])] : [headers];
    const idIndex = headers.indexOf('id');
    const emailIndex = headers.indexOf('email');
    const byId = new Map<string, number>();
    const byEmail = new Map<string, number>();
    for (let i = 1; i < next.length; i += 1) {
      if (idIndex >= 0) {
        const id = String(next[i]?.[idIndex] ?? '').trim();
        if (id) {
          byId.set(id, i);
        }
      }
      if (emailIndex >= 0) {
        const email = String(next[i]?.[emailIndex] ?? '').trim().toLowerCase();
        if (email) {
          byEmail.set(email, i);
        }
      }
    }
    for (const syncRow of rows) {
      const mapped = headers.map((header) => {
        const syncIndex = USER_SHEET_HEADERS.indexOf(header as (typeof USER_SHEET_HEADERS)[number]);
        return syncIndex >= 0 ? String(syncRow[syncIndex] ?? '') : '';
      });
      const id = idIndex >= 0 ? String(mapped[idIndex] ?? '').trim() : '';
      const email = emailIndex >= 0 ? String(mapped[emailIndex] ?? '').trim().toLowerCase() : '';
      const existing = (id && byId.get(id)) || (email && byEmail.get(email)) || undefined;
      if (existing == null) {
        const index = next.length;
        if (id) {
          byId.set(id, index);
        }
        if (email) {
          byEmail.set(email, index);
        }
        next.push(mapped);
      } else {
        // Keep extra Excel-only columns; overwrite known sync fields.
        const merged = [...(next[existing] ?? [])];
        for (let c = 0; c < headers.length; c += 1) {
          const header = headers[c];
          const syncIndex = USER_SHEET_HEADERS.indexOf(header as (typeof USER_SHEET_HEADERS)[number]);
          if (syncIndex >= 0) {
            merged[c] = mapped[c] ?? '';
          }
        }
        next[existing] = merged;
      }
    }
    const title = await this.usersTitle();
    await this.request(`${API}/${this.spreadsheetId}/values:batchClear`, {
      method: 'POST',
      body: { ranges: [title] },
    });
    await this.writeRange(`${this.quote(title)}!A1`, next);
  }

  async upsertServiceRows(rows: string[][]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const matrix = await this.readServicesMatrix();
    const headersOk = matrix.length > 0 && this.headersMatch(matrix[0] ?? []);
    // Ignore legacy Excel rows that don't match the sync header layout.
    const next: string[][] = headersOk ? [matrix[0], ...matrix.slice(1)] : [headerRow()];
    const idIndex = next[0].indexOf('id');
    const byId = new Map<string, number>();
    if (idIndex >= 0) {
      for (let i = 1; i < next.length; i += 1) {
        const id = String(next[i]?.[idIndex] ?? '').trim();
        if (id) {
          byId.set(id, i);
        }
      }
    }
    for (const row of rows) {
      const id = String(row[0] ?? '').trim();
      if (!id) {
        continue;
      }
      const existing = byId.get(id);
      if (existing == null) {
        byId.set(id, next.length);
        next.push(row);
      } else {
        next[existing] = row;
      }
    }
    await this.replaceServicesRows(next.slice(1));
  }

  /** Create missing tabs, then replace each sheet's cells with the given matrix. */
  async replaceWorkbookSheets(sheets: Array<{ title: string; values: string[][] }>): Promise<number> {
    if (sheets.length === 0) {
      return 0;
    }
    const resolved: Array<{ title: string; values: string[][] }> = [];
    for (const sheet of sheets) {
      const title = await this.ensureTab(sheet.title);
      resolved.push({ title, values: sheet.values });
    }
    let written = 0;
    for (const sheet of resolved) {
      const values = sheet.values.length > 0 ? sheet.values : [['info', 'empty']];
      await this.request(`${API}/${this.spreadsheetId}/values:batchClear`, {
        method: 'POST',
        body: { ranges: [sheet.title] },
      });
      await this.writeRange(`${this.quote(sheet.title)}!A1`, values);
      written += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return written;
  }

  /**
   * Create a tab if needed. Google sheet titles are case-insensitive, so
   * `services` and `Services` are the same tab — reuse and optionally rename.
   */
  private async ensureTab(preferredTitle: string): Promise<string> {
    const meta = await this.request<{
      sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
    }>(`${API}/${this.spreadsheetId}?fields=sheets.properties.title,sheets.properties.sheetId`);
    const match = (meta.sheets ?? []).find((sheet) =>
      this.sameSheetTitle(sheet.properties?.title, preferredTitle),
    );
    if (match?.properties?.title) {
      const current = match.properties.title;
      if (current !== preferredTitle && match.properties.sheetId != null) {
        try {
          await this.request(`${API}/${this.spreadsheetId}:batchUpdate`, {
            method: 'POST',
            body: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: { sheetId: match.properties.sheetId, title: preferredTitle },
                    fields: 'title',
                  },
                },
              ],
            },
          });
          return preferredTitle;
        } catch {
          return current;
        }
      }
      return current;
    }
    try {
      await this.request(`${API}/${this.spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [{ addSheet: { properties: { title: preferredTitle } } }],
        },
      });
      return preferredTitle;
    } catch (error) {
      if (!this.isSheetAlreadyExistsError(error, preferredTitle)) {
        throw error;
      }
      const again = await this.request<{
        sheets?: Array<{ properties?: { title?: string } }>;
      }>(`${API}/${this.spreadsheetId}?fields=sheets.properties.title`);
      const found = (again.sheets ?? []).find((sheet) =>
        this.sameSheetTitle(sheet.properties?.title, preferredTitle),
      );
      return found?.properties?.title ?? preferredTitle;
    }
  }

  private async servicesTitle(): Promise<string> {
    if (this.resolvedServicesTitle) {
      return this.resolvedServicesTitle;
    }
    this.resolvedServicesTitle = await this.ensureTab(this.servicesSheet);
    return this.resolvedServicesTitle;
  }

  private async usersTitle(): Promise<string> {
    if (this.resolvedUsersTitle) {
      return this.resolvedUsersTitle;
    }
    this.resolvedUsersTitle = await this.ensureTab(this.usersSheet);
    return this.resolvedUsersTitle;
  }

  private sameSheetTitle(left: string | undefined, right: string): boolean {
    return (left ?? '').trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
  }

  private isSheetAlreadyExistsError(error: unknown, title: string): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!/addSheet|INVALID_ARGUMENT|400/i.test(message)) {
      return false;
    }
    return (
      message.includes(title) ||
      /already exists|موجودة من قبل|يوجد بالفعل/i.test(message)
    );
  }

  private headersMatch(row: string[]): boolean {
    const expected = headerRow();
    return expected.every((name, index) => (row[index] ?? '').trim() === name);
  }

  private userHeadersMatch(row: string[]): boolean {
    const expected = userHeaderRow();
    return expected.every((name, index) => (row[index] ?? '').trim() === name);
  }

  private async writeRange(range: string, values: string[][]): Promise<void> {
    await this.request(
      `${API}/${this.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: { range, majorDimension: 'ROWS', values },
      },
    );
  }

  private quote(sheet: string): string {
    return `'${sheet.replaceAll("'", "''")}'`;
  }

  private async request<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const token = await this.auth.ensureAccessToken();
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: init.body == null ? undefined : JSON.stringify(init.body),
    });
    if (response.status === 401 || response.status === 403) {
      this.auth.disconnect();
      throw new Error('Google authorization expired. Connect the shop Google account again.');
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Google Sheets request failed (${response.status}).`);
    }
    if (response.status === 204) {
      return {} as T;
    }
    return (await response.json()) as T;
  }
}

function columnLetter(count: number): string {
  let n = count;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label || 'A';
}
