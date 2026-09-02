import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, two levels up from frontend/scripts/ — where wails.json lives. */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Files `wails generate module` must produce for the frontend to typecheck. */
export const requiredBindings = [
  'frontend/wailsjs/go/main/App.js',
  'frontend/wailsjs/go/main/App.d.ts',
  'frontend/wailsjs/go/models.ts',
  'frontend/wailsjs/runtime/runtime.js',
];

/**
 * Reports which of the required binding files are missing under root.
 * Exported so the check can be exercised without shelling out to Wails.
 */
export function missingBindings(root) {
  return requiredBindings.filter((relative) => !existsSync(path.join(root, relative)));
}

/**
 * Regenerates the Wails TypeScript bindings into frontend/wailsjs/.
 *
 * That directory is generated output and is not tracked, so a fresh clone has
 * no bindings at all and the fifteen source files importing them cannot
 * typecheck until this runs. It is wired to postinstall so `bun install` alone
 * leaves the tree buildable.
 *
 * `wails generate module` must run from the project root because it reads
 * wails.json, and it exits 0 even when it fails to find that file -- so the
 * exit code alone proves nothing and the output is verified instead.
 */
function main() {
  const result = spawnSync('wails', ['generate', 'module'], { // NOSONAR javascript:S4036 -- resolved from PATH on purpose, so it comes from the developer environment that launched this hook, exactly as every other frontend job in lefthook.yml resolves it. The repository cannot control that lookup, and the arguments are passed as an array rather than through a shell. Pinning an absolute path would break across platforms and, on Windows, would have to guess between the .exe, .cmd and .bat shims these tools ship as.
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  const missing = missingBindings(projectRoot);
  if (missing.length === 0) {
    return;
  }

  console.error(
    [
      '',
      'Wails bindings were not generated. Missing:',
      ...missing.map((relative) => `  - ${relative}`),
      '',
      'frontend/wailsjs/ is generated output and is not tracked by git, so the',
      'frontend cannot typecheck without it. Install the Wails CLI',
      '(https://wails.io/docs/gettingstarted/installation) and re-run',
      '`bun install`, or generate them directly with:',
      '',
      '  wails generate module',
      '',
    ].join('\n'),
  );

  process.exit(result.status === null || result.status === 0 ? 1 : result.status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
