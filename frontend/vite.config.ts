import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {configDefaults} from 'vitest/config'

// https://vitejs.dev/config/
export default defineConfig(
  /**
   * Builds the Vite config per mode: test runs skip the Tailwind plugin and
   * pre-bundle heavy UI dependencies so test-file imports stay fast.
   */
  ({mode}) => {
    // Suites that only exercise pure helpers, contracts and stores. Building a
    // jsdom document for them costs ~700ms each and buys nothing, so they run
    // in the `node` project and the `dom` project excludes exactly this list.
    // Anything importing a component, a hook, or a browser global belongs in
    // the `dom` project — `src/infrastructure/**` stays out of these globs on
    // purpose because its helper suites touch `window`. A misfiled suite fails
    // loudly with `document is not defined`; move it out of these globs then.
    const nodeTestInclude = [
      'src/features/**/__tests__/*.helpers.test.ts',
      'src/shared/**/__tests__/*.helpers.test.ts',
      'src/shared/store/**/__tests__/*.test.ts',
      'src/shared/constants/__tests__/*.test.ts',
      'src/shared/contracts/__tests__/*.test.ts',
      'scripts/__tests__/*.test.mjs'
    ]

    return {
      // Tailwind generates CSS the tests never consume; keep it out of test runs.
      plugins: mode === 'test' ? [react()] : [tailwindcss(), react()],
      test: {
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        forbidOnly: true,
        // Bounded file parallelism. This was `fileParallelism: false` because
        // the old pre-commit gate ran 14 jobs at once and left vitest no CPU to
        // spare. That gate now bounds every tool (see the concurrency budget in
        // lefthook.yml), so the suite gets a budget of its own back.
        //
        // Measured on the reference machine (i7-12700K, 12c/20t), 171 files /
        // 1450 tests green throughout: 186s sequential, 48s at 4 workers, 31s
        // at 8, 28s at 12. Eight looked like the knee — 12 bought 3s while
        // pushing cumulative environment cost from 111s to 154s.
        //
        // That benchmark ran vitest ALONE, which is not how the gate runs it.
        // `lefthook.yml` puts `frontend-heavy` beside `go-heavy` and
        // `dharness`, so eight workers land on top of four Go threads plus
        // react-doctor. Re-measured 2026-08-24 at 211 files / 1767 tests: the
        // suite still passes standalone at 8, but inside the gate four
        // integration tests starve past Vitest's 5s per-test budget and fail —
        // two in AnimeEditorWorkspace, one in the episode editor, one in the
        // notification table. At 4 workers the gate is green: 58.66s
        // standalone, 66s inside the hook. The ~17s the cap costs when vitest
        // runs alone is what buys a gate that does not fail on contention, and
        // it restores the value CLAUDE.md documented all along.
        //
        // Keep `maxWorkers` pinned: unbounded workers
        // reintroduce exactly the desktop starvation the cap exists to prevent.
        // `isolate: false` was measured and REJECTED: the suite fails without
        // per-file isolation, so that speedup is not available here.
        fileParallelism: true,
        maxWorkers: 4,
        projects: [
          {
            extends: true,
            test: {
              name: 'node',
              environment: 'node',
              include: nodeTestInclude
            }
          },
          {
            extends: true,
            test: {
              name: 'dom',
              environment: 'jsdom',
              // Setting `exclude` replaces Vitest's defaults, so keep them.
              exclude: [
                ...configDefaults.exclude,
                '**/.stryker-*/**',
                '**/*-mutation-tmp/**',
                ...nodeTestInclude
              ]
            }
          }
        ],
        server: {
          deps: {
            // Process react-aria-components through the Vite pipeline instead
            // of native Node ESM so its namespace stays spyable (vi.spyOn).
            inline: ['react-aria-components']
          }
        },
        deps: {
          optimizer: {
            client: {
              enabled: true,
              // Bundle deep-import-tree UI libraries once instead of paying
              // their module graph on every test file import. Two constraints:
              // optimized packages cannot be partially mocked (importOriginal
              // cannot re-import the bundle) nor namespace-spied (frozen ESM
              // namespace), so react-router and react-aria-components — which
              // tests stub via vi.spyOn — must stay out of this list.
              include: ['@heroui/react', '@iconify/react', '@nivo/bar']
            }
          }
        }
      }
    }
  }
)
