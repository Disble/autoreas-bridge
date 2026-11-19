import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `frontend/src/app/NotificationToasts.tsx` is the app-shell's ONE
 * mounting seam for the toast surface (notifications delta spec: "mounted
 * from the app-shell through exactly one thin re-export seam"). This pins
 * that structurally, rather than by rendering through a mocked HeroUI --
 * CLAUDE.md forbids hooks or business logic inside `frontend/src/app/**`,
 * so the file itself must never grow beyond a one-line re-export.
 */
describe('NotificationToasts re-export', () => {
  it('stays a one-line domain-agnostic re-export, never gaining hooks or business logic', () => {
    const filePath = path.resolve(__dirname, '../NotificationToasts.tsx');
    // Mutation runs instrument sources in place and prepend their own
    // pragma, so byte equality against the raw file fails under Stryker while
    // passing everywhere else. Judge the lines that are actually the module.
    const sourceLines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//'));

    expect(sourceLines).toEqual([
      "export { NotificationToasts } from '../features/notifications/ui/NotificationToasts/NotificationToasts';",
    ]);
  });
});
