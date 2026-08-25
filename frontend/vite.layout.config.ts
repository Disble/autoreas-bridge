import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Builds the layout-smoke fixture page: the REAL notification components,
 * rendered against the REAL stylesheet, so `layout-smoke.mjs` can measure them
 * in a browser.
 *
 * The root stays at the frontend project rather than at the fixture folder,
 * with the fixture named as the entry instead. Tailwind v4 detects its sources
 * from the root, so pointing the root at `scripts/layout-fixtures` made it scan
 * only the fixture -- and the utilities every component under test relies on
 * were never generated. The page still rendered, and every geometric assertion
 * it made was about an unstyled component: a harness reporting "ok" for a
 * layout that did not exist.
 *
 * A separate config rather than a second input on the app's own build: the
 * fixture must never ship inside the application bundle.
 */
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [tailwindcss(), react()],
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-layout'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'scripts/layout-fixtures/index.html'),
    },
  },
})
