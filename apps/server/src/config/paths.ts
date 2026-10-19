import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const migrationsPath = path.join(projectRoot, 'apps/server/drizzle');
