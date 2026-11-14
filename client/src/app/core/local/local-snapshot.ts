import { DATA_COLLECTIONS, type Doc, type NileDatabase } from './local-database';
import { all, bulkSave, fail } from './local-repo';

export interface NileBackup {
  format: 'nile-barbers-backup';
  version: 1;
  exportedAt: string;
  collections: Record<string, Doc[]>;
}

export async function exportSnapshot(db: NileDatabase): Promise<NileBackup> {
  const collections: Record<string, Doc[]> = {};
  for (const name of DATA_COLLECTIONS) {
    collections[name] = await all(db, name);
  }
  return { format: 'nile-barbers-backup', version: 1, exportedAt: new Date().toISOString(), collections };
}

export function validateBackup(value: unknown): NileBackup {
  if (!value || typeof value !== 'object') {
    fail(400, 'invalid_backup', 'The file is not a Nile backup.');
  }
  const backup = value as NileBackup;
  if (backup.format !== 'nile-barbers-backup' || backup.version !== 1 || !backup.collections) {
    fail(400, 'invalid_backup', 'The backup header is missing or from a newer version.');
  }
  const branches = backup.collections['branches'];
  if (!Array.isArray(branches) || branches.length !== 1 || !branches[0]?.id) {
    fail(400, 'invalid_backup', 'This computer keeps one branch. The backup must contain exactly one branch.');
  }
  for (const [name, rows] of Object.entries(backup.collections)) {
    if (!DATA_COLLECTIONS.includes(name as (typeof DATA_COLLECTIONS)[number])) {
      fail(400, 'invalid_backup', `The backup contains an unknown collection: ${name}.`);
    }
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || typeof row.id !== 'string' || row.id.length === 0)) {
      fail(400, 'invalid_backup', `Collection ${name} has a record without an id.`);
    }
  }
  return backup;
}

export async function importSnapshot(db: NileDatabase, backup: NileBackup): Promise<void> {
  await db.transaction('rw', db.records, async () => {
    for (const name of DATA_COLLECTIONS) {
      await db.records.where('collection').equals(name).delete();
      const rows = backup.collections[name] ?? [];
      if (rows.length > 0) {
        await bulkSave(db, name, rows);
      }
    }
  });
}

export async function collectionCounts(db: NileDatabase): Promise<Array<{ collection: string; count: number }>> {
  const counts: Array<{ collection: string; count: number }> = [];
  for (const name of DATA_COLLECTIONS) {
    counts.push({ collection: name, count: await db.records.where('collection').equals(name).count() });
  }
  return counts.filter((item) => item.count > 0);
}
