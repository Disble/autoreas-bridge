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
 * Lints the fixture as if it lived at `relativePath` and returns the icon-only rule's messages.
 *
 * @param relativePath Path under the frontend root the fixture pretends to be.
 * @returns The `no-restricted-syntax` messages that name IconActionButton.
 */
async function iconOnlyMessages(relativePath) {
  const eslint = new ESLint({ cwd: frontendRoot });
  const [result] = await eslint.lintText(RAW_ICON_ONLY, { filePath: path.join(frontendRoot, relativePath) });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax' && message.message.includes('IconActionButton'));
}

describe('icon-only lint rule', () => {
  it.each([
    { relativePath: 'src/features/season/ui/Fixture/Fixture.tsx', count: 1 },
    { relativePath: 'src/shared/ui/HelpTooltip/HelpTooltip.tsx', count: 0 },
    { relativePath: 'src/features/season/ui/Fixture/__tests__/Fixture.test.tsx', count: 0 },
  ])('reports $count raw isIconOnly in $relativePath', async ({ relativePath, count }) => {
    expect(await iconOnlyMessages(relativePath)).toHaveLength(count);
  });
});
