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
      'src/shared/contracts/__tests__/*.test.ts'
    ]

    return {
      // Tailwind generates CSS the tests never consume; keep it out of test runs.
      plugins: mode === 'test' ? [react()] : [tailwindcss(), react()],
      test: {
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        forbidOnly: true,
        // One worker per logical core starves the heavy integration suites:
        // with the default fan-out the slowest test spent ~3s of its 5s budget,
        // so a busy machine turned a green suite red. Half the cores roughly
        // halves per-test latency for no extra wall time.
        maxWorkers: '50%',
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
              exclude: [...configDefaults.exclude, ...nodeTestInclude]
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
