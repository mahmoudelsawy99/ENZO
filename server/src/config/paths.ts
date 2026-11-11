import path from 'node:path';

/** Resolved from the server working directory used by the npm scripts. */
export const uploadsRoot = path.resolve(process.cwd(), 'uploads');
export const logoDir = path.join(uploadsRoot, 'logos');
export const employeePhotoDir = path.join(uploadsRoot, 'employees');
export const catalogDir = path.join(uploadsRoot, 'catalog');
