import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** The frontend workspace, whose eslint.config.js the rule lives in. */
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A feature component that hand-rolls an icon-only Button. */
const RAW_ICON_ONLY = `import { Button } from '@heroui/react';
/** Fixture. */
export function Fixture() {
  return <Button isIconOnly aria-label="Remove" />;
}
`;

/**
 * The three locations the rule must treat differently, and what each must report.
 *
 * A plain feature file reports the one raw `isIconOnly`; a named exception in
 * eslint.config.js and a test file next to the fixture report none.
 */
const CASES = [
  { relativePath: 'src/features/season/ui/Fixture/Fixture.tsx', count: 1 },
  { relativePath: 'src/shared/ui/HelpTooltip/HelpTooltip.tsx', count: 0 },
  { relativePath: 'src/features/season/ui/Fixture/__tests__/Fixture.test.tsx', count: 0 },
];

/**
 * The one ESLint instance this file lints with.
 *
 * Resolving the workspace config is a one-off process cost, not part of what
 * the rule under test does: eslint.config.js pulls the TypeScript parser (which
 * loads `typescript`), @typescript-eslint's estree and both rule plugins, some
 * 650 files in all. On an unwarmed filesystem cache that read costs more than a
 * single test's 5 s budget — measured 6013 ms here — which is the only reason
 * this file failed in `pre-merge-commit`. `pre-commit` warms the cache with its
 * staged ESLint run; the merge lane has no such job, so this file was the first
 * ESLint consumer on a cold cache.
 *
 * The warm-up call below therefore runs while the file is being collected,
 * where no test timeout applies, and each case keeps its unchanged 5 s budget
 * for the assertion itself. No timeout is overridden: raising one would hide
 * the next slow import instead of placing this cost where it belongs.
 */
const eslint = new ESLint({ cwd: frontendRoot });

/**
 * Lints the fixture as if it lived at `relativePath` and returns the icon-only rule's messages.
 *
 * @param relativePath Path under the frontend root the fixture pretends to be.
 * @returns The `no-restricted-syntax` messages that name IconActionButton.
 */
async function iconOnlyMessages(relativePath) {
  const [result] = await eslint.lintText(RAW_ICON_ONLY, { filePath: path.join(frontendRoot, relativePath) });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax' && message.message.includes('IconActionButton'));
}

// Pay the cold config load, and the first parse, before any test budget starts.
await iconOnlyMessages(CASES[0].relativePath);

describe('icon-only lint rule', () => {
  it.each(CASES)('reports $count raw isIconOnly in $relativePath', async ({ relativePath, count }) => {
    expect(await iconOnlyMessages(relativePath)).toHaveLength(count);
  });
});
