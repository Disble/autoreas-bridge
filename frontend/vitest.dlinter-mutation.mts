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
    exclude: ['scripts/**', '**/scripts/**', '**/.dlinter-mutation-tmp/**'],
    server: { deps: { inline: ['react-aria-components'] } },
    deps: { optimizer: { client: { enabled: false }, ssr: { enabled: false } } },
  },
});
