// fallow-ignore-file unused-file

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Absolute path of this test file, used to locate the repo root. */
const testFilePath = fileURLToPath(import.meta.url);
/** Absolute path of the `frontend/` workspace. */
const frontendRoot = path.resolve(path.dirname(testFilePath), '..', '..');
/** Absolute path of the repository root, one level above `frontend/`. */
const repoRoot = path.resolve(frontendRoot, '..');
/** The OpenSpec change folder whose artifacts these assertions pin. */
const changeRoot = path.join(
  repoRoot,
  'openspec',
  'changes',
  '2026-06-19-sdd-21-linter-architecture-enforcement',
);

/**
 * Reads a repository file as UTF-8 text from path segments relative to the root.
 * @param {...string} segments Path segments below the repository root.
 * @returns {string} The file contents.
 */
function readRepoFile(...segments) {
  return readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('architecture docs and artifacts', () => {
  // Rewritten 2026-08-13. These assertions were written for SDD-21 (June 2026)
  // and pinned the pre-ADR-011 barrel contract: they REQUIRED the docs to say
  // that modules expose their surface through a pure re-export `index.ts`, and
  // that infrastructure adapters are entered at `<adapter>/index.ts`. ADR-011
  // deleted all 67 barrels in July 2026, so from then on this test was keeping
  // three documents describing a structure the repo no longer has. It now pins
  // the opposite, which is what the tree actually looks like.
  it('documents concrete-path imports and no barrel entrypoints', () => {
    const eslintReadme = readRepoFile('frontend', 'eslint', 'README.md');
    const architectureManifesto = readRepoFile('ARCHITECTURE.md');
    const runtimeArchitectureDoc = readRepoFile('docs', 'architecture.md');

    // A positive assertion on purpose: the README quotes the old barrel claim
    // in order to name it as false, so a substring-absence check would fail on
    // the very sentence that corrects the record.
    expect(eslintReadme).toContain('react-doctor');
    expect(eslintReadme).toContain('There are no barrels here.');

    expect(architectureManifesto).toContain('There is no `index.ts` entrypoint');
    expect(architectureManifesto).toContain('No flat `*-source.ts` compatibility facades remain once an infrastructure adapter is migrated.');

    expect(runtimeArchitectureDoc).toContain('no hay `index.ts` de entrada');
    expect(runtimeArchitectureDoc).toContain('No compatibility shims or production allowlist entries remain for the migrated infrastructure adapters.');
  });

  it('captures the final slice status and removes stale shim wording from active OpenSpec artifacts', () => {
    const designText = readFileSync(path.join(changeRoot, 'design.md'), 'utf8');
    const tasksText = readFileSync(path.join(changeRoot, 'tasks.md'), 'utf8');
    const verifyText = readFileSync(path.join(changeRoot, 'verify-report.md'), 'utf8');

    expect(designText).toContain('All six migrated infrastructure adapters now live at `frontend/src/infrastructure/<adapter>/index.ts`');
    expect(designText).toContain('No compatibility shims or production allowlist entries remain.');
    expect(designText).not.toContain('temporary facades');
    expect(designText).not.toContain('short-lived compatibility shim');

    expect(tasksText).toContain('removed flat facades');
    expect(tasksText).toContain('- [x] 6.1');
    expect(tasksText).toContain('- [x] 6.2');
    expect(tasksText).toContain('- [x] 7.1');
    expect(tasksText).toContain('- [x] 7.2');

    expect(verifyText).toContain('PASS WITH WARNINGS');
    expect(verifyText).toContain('Final orchestrated verification completed');
  });
});
