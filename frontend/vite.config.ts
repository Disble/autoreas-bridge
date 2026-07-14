import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(
  /**
   * Builds the Vite config per mode: test runs skip the Tailwind plugin and
   * pre-bundle heavy UI dependencies so test-file imports stay fast.
   */
  ({mode}) => ({
    // Tailwind generates CSS the tests never consume; keep it out of test runs.
    plugins: mode === 'test' ? [react()] : [tailwindcss(), react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      server: {
        deps: {
          // Process react-aria-components through the Vite pipeline instead of
          // native Node ESM so its namespace stays spyable (vi.spyOn).
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
  })
)
