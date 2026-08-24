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
    const contents = readFileSync(filePath, 'utf-8').trim();

    expect(contents).toBe(
      "export { NotificationToasts } from '../features/notifications/ui/NotificationToasts/NotificationToasts';",
    );
  });
});
