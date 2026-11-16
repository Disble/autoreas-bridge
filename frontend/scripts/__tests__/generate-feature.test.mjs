// fallow-ignore-file unused-file

import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/** Absolute path of this test file, the anchor for locating the generator. */
const testFilePath = fileURLToPath(import.meta.url);

/** Frontend package root, two levels up from `scripts/__tests__`. */
const frontendRoot = path.resolve(path.dirname(testFilePath), '..', '..');

/** The generator under test; it is copied into each throwaway workspace. */
const generatorPath = path.join(frontendRoot, 'scripts', 'generate-feature.js');

/** Every temp workspace created by this suite, removed in `afterEach`. */
const tempDirectories = [];

/** Creates an isolated temp workspace holding a copy of the generator. */
function createWorkspace() {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'generate-feature-'));
  tempDirectories.push(workspace);

  mkdirSync(path.join(workspace, 'scripts'), { recursive: true });
  mkdirSync(path.join(workspace, 'src', 'features'), { recursive: true });
  writeFileSync(path.join(workspace, 'scripts', 'generate-feature.js'), readFileSync(generatorPath, 'utf8'));

  return workspace;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('generate-feature scaffolding', () => {
  it('emits frontend files that satisfy the global architecture policy defaults', () => {
    const workspace = createWorkspace();

    execFileSync(execPath, [path.join('scripts', 'generate-feature.js'), 'dashboard', 'BridgeStatusCard'], {
      cwd: workspace,
      stdio: 'pipe',
    });

    const componentRoot = path.join(workspace, 'src', 'features', 'dashboard', 'ui', 'BridgeStatusCard');
    const componentText = readFileSync(path.join(componentRoot, 'BridgeStatusCard.tsx'), 'utf8');
    const hookText = readFileSync(path.join(componentRoot, 'use-bridge-status-card.ts'), 'utf8');
    const helpersText = readFileSync(path.join(componentRoot, 'bridge-status-card.helpers.ts'), 'utf8');
    const typesText = readFileSync(path.join(componentRoot, 'bridge-status-card.types.ts'), 'utf8');
    const constantsText = readFileSync(path.join(componentRoot, 'bridge-status-card.constants.ts'), 'utf8');
    const helperTestText = readFileSync(path.join(componentRoot, '__tests__', 'bridge-status-card.helpers.test.ts'), 'utf8');
    const hookTestText = readFileSync(path.join(componentRoot, '__tests__', 'use-bridge-status-card.test.ts'), 'utf8');
    const componentTestText = readFileSync(path.join(componentRoot, '__tests__', 'BridgeStatusCard.test.tsx'), 'utf8');
    // No barrel: modules are imported by concrete path. A scaffolded index.ts
    // was never imported by the rest of the tree and only produced dead files.
    expect(existsSync(path.join(componentRoot, 'index.ts'))).toBe(false);
    expect(existsSync(path.join(componentRoot, 'bridge-status-card-source.ts'))).toBe(false);
    // No scaffolded Zod schema either, for the same reason: every generated
    // `.schema.ts` stayed a placeholder nobody filled in, and the six of them
    // were the only thing keeping `zod` in the dependency list.
    expect(existsSync(path.join(componentRoot, 'bridge-status-card.schema.ts'))).toBe(false);

    expect(componentText).toContain('export function BridgeStatusCard(props: Readonly<BridgeStatusCardProps>)');
    expect(componentText).toContain('/**');

    expect(hookText).toContain('export function useBridgeStatusCard(props: Readonly<BridgeStatusCardProps>)');
    expect(hookText).toContain('/**');
    expect(helpersText).toContain('/**');

    expect(typesText).toContain('/**');
    expect(constantsText).toContain('/**');

    expect(helperTestText).toContain("returns fallback title when omitted");
    expect(hookTestText).toContain("returns fallback values when omitted");
    expect(componentTestText).toContain("renders fallback content and the loading region");
    expect(componentTestText).toContain('render(<BridgeStatusCard />, createBridgeQueryTestWrapper());');
    expect(componentTestText).toContain("expect(screen.getByText('BridgeStatusCard')).toBeInTheDocument();");
    expect(componentTestText).toContain("expect(screen.getByText('Replace this scaffold with real feature content.')).toBeInTheDocument();");
  });

  it('emits a hook that reads backend data through useBridgeQuery and toAsyncView, never a binding', () => {
    const workspace = createWorkspace();

    execFileSync(execPath, [path.join('scripts', 'generate-feature.js'), 'dashboard', 'BridgeStatusCard'], {
      cwd: workspace,
      stdio: 'pipe',
    });

    const componentRoot = path.join(workspace, 'src', 'features', 'dashboard', 'ui', 'BridgeStatusCard');
    const generated = ['BridgeStatusCard.tsx', 'use-bridge-status-card.ts', 'bridge-status-card.helpers.ts', 'bridge-status-card.constants.ts']
      .map((name) => readFileSync(path.join(componentRoot, name), 'utf8'));
    const [componentText, hookText, helpersText, constantsText] = generated;

    expect(hookText).toContain('useBridgeQuery({ queryKey: BridgeStatusCardQueryKey, queryFn: loadBridgeStatusCard })');
    expect(hookText).toContain('const view = toAsyncView(query);');
    expect(hookText).toContain('TODO(bridge-data): add the Go binding GetBridgeStatusCard');
    expect(helpersText).toContain("Promise.reject(new Error('BridgeStatusCard is not bound to GetBridgeStatusCard yet'))");
    expect(constantsText).toContain("defineQueryKeys('dashboard').key('bridge-status-card')");
    for (const kind of ['loading', 'failure', 'empty', 'ready']) {
      expect(componentText).toContain(`view.kind === '${kind}'`);
    }
    for (const text of generated) {
      expect(text).not.toMatch(/infrastructure\/|wailsjs|@tanstack\/react-query/);
    }
  });

  it('imports shared modules by paths that exist from a real feature folder', () => {
    const workspace = createWorkspace();

    execFileSync(execPath, [path.join('scripts', 'generate-feature.js'), 'dashboard', 'BridgeStatusCard'], {
      cwd: workspace,
      stdio: 'pipe',
    });

    const componentRoot = path.join(workspace, 'src', 'features', 'dashboard', 'ui', 'BridgeStatusCard');
    const realComponentRoot = path.join(frontendRoot, 'src', 'features', 'dashboard', 'ui', 'BridgeStatusCard');
    const sharedImports = ['', '__tests__']
      .flatMap((folder) => readdirSync(path.join(componentRoot, folder), { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => [folder, readFileSync(path.join(componentRoot, folder, entry.name), 'utf8')]))
      .flatMap(([folder, text]) => [...text.matchAll(/from '(\.[^']*\/shared\/[^']*)'/g)].map((match) => path.resolve(realComponentRoot, folder, match[1])));

    expect(sharedImports.length).toBeGreaterThan(0);
    for (const target of sharedImports) {
      expect(['.ts', '.tsx'].some((extension) => existsSync(`${target}${extension}`)), target).toBe(true);
    }
  });
});
