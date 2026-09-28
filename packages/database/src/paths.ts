import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the forward-only SQL migrations shipped with this package. */
export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);
