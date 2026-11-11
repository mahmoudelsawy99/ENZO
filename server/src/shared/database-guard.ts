/** Refuses commands that would read or write the live shop database. */

const BLOCKED = new Set(['enzo', 'admin', 'local', 'config']);

export function databaseNameFromUri(uri: string): string {
  const withoutQuery = uri.split('?')[0] ?? '';
  const slash = withoutQuery.lastIndexOf('/');
  return slash >= 0 ? withoutQuery.slice(slash + 1) : '';
}

export function assertIsolatedDatabase(uri: string | undefined, action: string): string {
  const target = uri?.trim() ?? '';
  if (!target) {
    throw new Error(`${action} requires UAT_MONGODB_URI. The live shop database is not a test target.`);
  }
  if ((process.env['NODE_ENV'] ?? '').trim() === 'production') {
    throw new Error(`${action} is refused while NODE_ENV is production.`);
  }
  const name = databaseNameFromUri(target);
  if (!name || BLOCKED.has(name) || !name.startsWith('enzo_uat')) {
    throw new Error(`${action} is refused for database "${name || '(missing)'}". Use a database whose name starts with enzo_uat.`);
  }
  return target;
}
