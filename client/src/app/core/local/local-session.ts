const SESSION_KEY = 'nile.local.session';

export interface PersistedSession {
  token: string;
  userId: string;
  expiresAt: string;
  remember: boolean;
}

let activeUserId: string | null = null;
let writeListener: (() => void) | null = null;

export function localUserId(): string | null {
  return activeUserId;
}

export function setLocalUser(userId: string | null): void {
  activeUserId = userId;
}

export function bindLocalWrites(listener: () => void): void {
  writeListener = listener;
}

export function markLocalWrite(): void {
  writeListener?.();
}

export function readPersistedSession(): PersistedSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed.token || !parsed.userId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedSession(session: PersistedSession): void {
  const raw = JSON.stringify(session);
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (session.remember) {
    localStorage.setItem(SESSION_KEY, raw);
  } else {
    sessionStorage.setItem(SESSION_KEY, raw);
  }
}

export function clearPersistedSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  activeUserId = null;
}
