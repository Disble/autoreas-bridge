import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Stryker's per-test runner cannot execute the application's Vitest projects.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    forbidOnly: true,
    // Pinned to the same 4-worker cap the application config (`vite.config.ts`)
    // already documents: the gate runs this suite beside other load (Go threads,
    // dharness, other agent sessions, the owner's desktop apps), and at 50%
    // (~8 workers here) that contention starves per-test 5s budgets — measured
    // 2026-09-13 on this machine, same command, same tree: 50% workers failed
    // 20+ unrelated tests with timeouts, `--maxWorkers=4` left 3 marginal
    // failures (5818/5150/5224 ms). This is NOT a weakening: the same tests
    // run, the same mutants are generated, and the same 5s per-test budget
    // applies — only the worker count changes, trading gate wall-clock for a
    // verdict that does not depend on how busy the desktop is. It is the same
    // contention class as the DOCUMENTED EXCEPTION below, resolved by
    // scheduling instead of by excluding another file.
    maxWorkers: 4,
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
    // budget. With this one file excluded the dry run completes cleanly.
    // (2026-09-13, SDD-71: the gate is a zero-tolerance verdict now, no
    // numeric score or break threshold to clear.)
    //
    // Remove this the moment the test can finish inside 5s under contention.
    exclude: ['scripts/**', '**/scripts/**', '**/NotificationTable.windowing.test.tsx'],
    server: { deps: { inline: ['react-aria-components'] } },
    deps: { optimizer: { client: { enabled: false }, ssr: { enabled: false } } },
  },
});
