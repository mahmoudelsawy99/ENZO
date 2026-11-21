import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { GoogleTokenState } from './google-sheet.models';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (override?: { prompt?: string }) => void;
          };
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Google Identity Services for spreadsheet access only.
 * Access tokens stay in memory. This is not the cashier login.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private token: GoogleTokenState | null = null;
  private client: { requestAccessToken: (override?: { prompt?: string }) => void } | null = null;
  private scriptPromise: Promise<void> | null = null;
  private pending: { resolve: () => void; reject: (error: Error) => void } | null = null;

  readonly connected = signal(false);
  readonly lastError = signal('');

  isConnected(): boolean {
    return Boolean(this.token && this.token.expiresAt > Date.now() + 30_000);
  }

  async ensureAccessToken(): Promise<string> {
    if (this.isConnected() && this.token) {
      return this.token.accessToken;
    }
    await this.connect(false);
    if (!this.token) {
      throw new Error('Google did not return an access token.');
    }
    return this.token.accessToken;
  }

  async connect(forceConsent = false): Promise<void> {
    this.lastError.set('');
    await this.loadScript();
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services failed to load.');
    }
    this.client ??= window.google.accounts.oauth2.initTokenClient({
      client_id: environment.googleSheets.clientId,
      scope: SHEETS_SCOPE,
      callback: (response) => this.onToken(response),
      error_callback: (error) => {
        const message = error.message || error.type || 'Google authorization failed.';
        this.lastError.set(message);
        this.pending?.reject(new Error(message));
        this.pending = null;
      },
    });
    return new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.client?.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
    });
  }

  disconnect(): void {
    const accessToken = this.token?.accessToken;
    this.token = null;
    this.connected.set(false);
    this.lastError.set('');
    if (accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => undefined);
    }
  }

  private onToken(response: { access_token?: string; expires_in?: number; error?: string }): void {
    if (response.error || !response.access_token) {
      const message = response.error || 'Google authorization was cancelled.';
      this.lastError.set(message);
      this.connected.set(false);
      this.token = null;
      this.pending?.reject(new Error(message));
      this.pending = null;
      return;
    }
    const expiresIn = Math.max(60, Number(response.expires_in) || 3600);
    this.token = {
      accessToken: response.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    this.connected.set(true);
    this.lastError.set('');
    this.pending?.resolve();
    this.pending = null;
  }

  private loadScript(): Promise<void> {
    if (window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }
    this.scriptPromise ??= new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Could not load Google Identity Services.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load Google Identity Services.'));
      document.head.appendChild(script);
    });
    return this.scriptPromise;
  }
}
