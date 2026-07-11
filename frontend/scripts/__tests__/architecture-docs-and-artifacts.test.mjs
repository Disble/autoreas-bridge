// fallow-ignore-file unused-file

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testFilePath = fileURLToPath(import.meta.url);
const frontendRoot = path.resolve(path.dirname(testFilePath), '..', '..');
const repoRoot = path.resolve(frontendRoot, '..');
const changeRoot = path.join(
  repoRoot,
  'openspec',
  'changes',
  '2026-06-19-sdd-21-linter-architecture-enforcement',
);

function readRepoFile(...segments) {
  return readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('architecture docs and artifacts', () => {
  it('documents the final global rule and folder-owned entrypoint contract', () => {
    const eslintReadme = readRepoFile('frontend', 'eslint', 'README.md');
    const architectureManifesto = readRepoFile('ARCHITECTURE.md');
    const runtimeArchitectureDoc = readRepoFile('docs', 'architecture.md');

    expect(eslintReadme).toContain('Folder-owned modules expose their public surface only through a pure re-export `index.ts`');
    expect(eslintReadme).toContain('No flat facade or compatibility shim allowance remains for migrated infrastructure adapters.');

    expect(architectureManifesto).toContain('`frontend/src/infrastructure/<adapter>/index.ts`');
    expect(architectureManifesto).toContain('No flat `*-source.ts` compatibility facades remain once an infrastructure adapter is migrated.');

    expect(runtimeArchitectureDoc).toContain('`frontend/src/infrastructure/<adapter>/index.ts`');
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
