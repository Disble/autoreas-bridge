import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Stryker's per-test runner cannot execute the application's Vitest projects.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    forbidOnly: true,
    maxWorkers: '50%',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // DOCUMENTED EXCEPTION (2026-08-23, SDD-60). NotificationTable.windowing
    // is excluded from the mutation runner's suite ONLY. It still runs in
    // `bun run test` and therefore in the gate's `frontend-test` job, so the
    // DOM-count guard it exists for is not weakened.
    //
    // Why: Stryker executes the whole suite once, instrumented, before it
    // mutates anything, and it does so with concurrency 4 against a config
    // already at maxWorkers 50%. That test drives real react-aria
    // intersection machinery through a real HeroUI Table; under that
    // contention it exceeds Vitest's 5s default and fails the dry run, which
    // aborts the entire mutation step. Raising a per-test timeout is
    // forbidden here by `no-restricted-syntax` (it hides the cost rather than
    // removing it), and raising `dryRunTimeoutMinutes` did not help because
    // the failure is a per-test timeout inside the run, not the run's own
    // budget. With this one file excluded the dry run completes and the score
    // lands at 82.14 against a break threshold of 80.
    //
    // Remove this the moment the test can finish inside 5s under contention.
    exclude: ['scripts/**', '**/scripts/**', '**/.dlinter-mutation-tmp/**', '**/NotificationTable.windowing.test.tsx'],
    server: { deps: { inline: ['react-aria-components'] } },
    deps: { optimizer: { client: { enabled: false }, ssr: { enabled: false } } },
  },
});
