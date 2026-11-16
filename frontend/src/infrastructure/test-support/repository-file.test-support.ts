import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Finds a tracked repository file, such as a Go-side contract JSON, by walking
 * up from the calling test. A fixed `../../..` path breaks inside a Stryker
 * sandbox, which sits deeper below the repository root.
 * @param relativePath - The file's path below the repository root, for example `internal/apperr/error-codes.json`.
 * @param fromUrl - The calling test's `import.meta.url`.
 * @returns The absolute path of the file.
 * @throws When no ancestor directory contains the file.
 */
export function findRepositoryFile(relativePath: string, fromUrl: string): string {
  let directory = path.dirname(fileURLToPath(fromUrl));
  while (!existsSync(path.join(directory, relativePath))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`${relativePath} not found above this test`);
    }
    directory = parent;
  }
  return path.join(directory, relativePath);
}
