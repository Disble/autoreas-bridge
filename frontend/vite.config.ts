import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Heavy transform/import cost (Tailwind + HeroUI + React) makes a first
    // render exceed the default 5s per-test limit under vitest worker
    // contention, flaking otherwise-passing tests. Give slow imports headroom.
    testTimeout: 20000,
    hookTimeout: 20000
  }
})
