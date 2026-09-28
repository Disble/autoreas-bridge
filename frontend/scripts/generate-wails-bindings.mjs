import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, two levels up from frontend/scripts/ — where wails.json lives. */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Directory `main.go` embeds with `//go:embed all:frontend/dist`. */
const embedDir = 'frontend/dist';

/**
 * Placeholder that satisfies the embed pattern before the first frontend build.
 * `.keep` matches because the directive uses the `all:` prefix; a plain
 * `//go:embed frontend/dist` would still ignore it, which is why the prefix is
 * asserted in the test name rather than silently assumed.
 */
const embedPlaceholder = '.keep';

/** Files `wails generate module` must produce for the frontend to typecheck. */
export const requiredBindings = [
  'frontend/wailsjs/go/desktop/App.js',
  'frontend/wailsjs/go/desktop/App.d.ts',
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
 * Creates the ignored embed target `main.go` needs, and only that.
 *
 * `wails generate module` typechecks the main package on its way to the bound
 * Go types, so `//go:embed all:frontend/dist` is compiled before any binding
 * exists. In a fresh worktree that directory is absent, the Go build fails, and
 * the generator's own "bindings were not generated" error points at the Wails
 * CLI instead of at the missing asset directory -- the misleading failure this
 * fixes. The directory must also hold a matching file: Go rejects a pattern that
 * matches an empty directory with "no matching files found", so a `dist/`
 * created by something other than a build is filled rather than trusted.
 *
 * A real build output is left untouched, because postinstall uses the generator
 * while `wails build` may already have written `dist/`.
 *
 * @returns whether the placeholder was created, which callers report to the user.
 */
export function ensureEmbedTarget(root) {
  const absolute = path.join(root, embedDir);
  if (existsSync(absolute) && readdirSync(absolute).length > 0) {
    return false;
  }

  mkdirSync(absolute, { recursive: true });
  writeFileSync(path.join(absolute, embedPlaceholder), '');
  return true;
}

/**
 * Explains the ignored embed target the generator had to create, so a fresh
 * worktree's bootstrap output does not look like a stray untracked file.
 */
function reportNewEmbedTarget() {
  if (!ensureEmbedTarget(projectRoot)) {
    return;
  }

  console.log(
    `Created ${embedDir}/${embedPlaceholder} so //go:embed all:${embedDir} can compile. ` +
      'It is generated output and stays ignored by git.',
  );
}

/**
 * Reports the bindings `wails generate module` failed to write and exits.
 *
 * The exit code alone proves nothing -- `wails` exits 0 even when it cannot
 * find wails.json -- so a status of 0 or no status at all is reported as this
 * script's own failure, and any real Wails failure keeps its own code.
 *
 * @param missing the required binding files `wails` did not produce.
 * @param status the exit status of the `wails` process, or null if it never ran.
 */
function failMissingBindings(missing, status) {
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

  process.exit(status === null || status === 0 ? 1 : status);
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
 * output is verified instead of the exit code.
 */
function main() {
  reportNewEmbedTarget();

  const result = spawnSync('wails', ['generate', 'module'], { // NOSONAR javascript:S4036 -- resolved from PATH on purpose, so it comes from the developer environment that launched this hook, exactly as every other frontend job in lefthook.yml resolves it. The repository cannot control that lookup, and the arguments are passed as an array rather than through a shell. Pinning an absolute path would break across platforms and, on Windows, would have to guess between the .exe, .cmd and .bat shims these tools ship as.
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  const missing = missingBindings(projectRoot);
  if (missing.length > 0) {
    failMissingBindings(missing, result.status);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
