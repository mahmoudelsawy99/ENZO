import type { Doc } from '../local/local-database';
import { asList, str } from '../local/local-repo';

/** Excel / Google `users` tab columns (no password secrets). */
export const USER_SHEET_HEADERS = [
  'fullName',
  'email',
  'phone',
  'userType',
  'tenantId',
  'status',
  'isEmailVerified',
  'lastLoginAt',
  'isOwner',
  'branchScope',
  'permissions',
  'roleIds',
  'employeeId',
  'id',
  'createdAt',
  'updatedAt',
] as const;

export type UserSheetHeader = (typeof USER_SHEET_HEADERS)[number];

export function userHeaderRow(): string[] {
  return [...USER_SHEET_HEADERS];
}

export function userToRow(user: Doc): string[] {
  const cell = (key: UserSheetHeader): string => {
    if (key === 'permissions' || key === 'roleIds') {
      return JSON.stringify(asList(user[key]));
    }
    if (key === 'isEmailVerified' || key === 'isOwner') {
      return user[key] === true ? 'TRUE' : 'FALSE';
    }
    if (key === 'lastLoginAt' || key === 'employeeId') {
      const value = user[key];
      return value == null ? '' : String(value);
    }
    return str(user, key);
  };
  return USER_SHEET_HEADERS.map((key) => cell(key));
}
