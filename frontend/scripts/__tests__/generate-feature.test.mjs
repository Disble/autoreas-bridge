// fallow-ignore-file unused-file

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const testFilePath = fileURLToPath(import.meta.url);
const frontendRoot = path.resolve(path.dirname(testFilePath), '..', '..');
const generatorPath = path.join(frontendRoot, 'scripts', 'generate-feature.js');

const tempDirectories = [];

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
    const indexText = readFileSync(path.join(componentRoot, 'index.ts'), 'utf8');
    const componentText = readFileSync(path.join(componentRoot, 'BridgeStatusCard.tsx'), 'utf8');
    const hookText = readFileSync(path.join(componentRoot, 'use-bridge-status-card.ts'), 'utf8');
    const helpersText = readFileSync(path.join(componentRoot, 'bridge-status-card.helpers.ts'), 'utf8');
    const typesText = readFileSync(path.join(componentRoot, 'bridge-status-card.types.ts'), 'utf8');
    const constantsText = readFileSync(path.join(componentRoot, 'bridge-status-card.constants.ts'), 'utf8');
    const schemaText = readFileSync(path.join(componentRoot, 'bridge-status-card.schema.ts'), 'utf8');
    const helperTestText = readFileSync(path.join(componentRoot, '__tests__', 'bridge-status-card.helpers.test.ts'), 'utf8');
    const hookTestText = readFileSync(path.join(componentRoot, '__tests__', 'use-bridge-status-card.test.ts'), 'utf8');
    const componentTestText = readFileSync(path.join(componentRoot, '__tests__', 'BridgeStatusCard.test.tsx'), 'utf8');
    expect(indexText.trim()).toBe("export { BridgeStatusCard } from './BridgeStatusCard';");
    expect(indexText).not.toContain('/**');
    expect(existsSync(path.join(componentRoot, 'bridge-status-card-source.ts'))).toBe(false);

    expect(componentText).toContain('export function BridgeStatusCard(props: Readonly<BridgeStatusCardProps>)');
    expect(componentText).toContain('/**');

    expect(hookText).toContain('export function useBridgeStatusCard(props: Readonly<BridgeStatusCardProps>)');
    expect(hookText).toContain('/**');
    expect(helpersText).toContain('/**');

    expect(typesText).toContain('/**');
    expect(constantsText).toContain('/**');
    expect(schemaText).toContain('/**');

    expect(helperTestText).toContain("returns fallback title when omitted");
    expect(hookTestText).toContain("returns fallback values when omitted");
    expect(componentTestText).toContain("renders fallback content when props are omitted");
    expect(componentTestText).toContain('render(<BridgeStatusCard />);');
    expect(componentTestText).toContain("expect(screen.getByText('BridgeStatusCard')).toBeInTheDocument();");
    expect(componentTestText).toContain("expect(screen.getByText('Replace this scaffold with real feature content.')).toBeInTheDocument();");
  });
});
