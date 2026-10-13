import { readFileSync } from 'node:fs';

/** Shared settings preserve the existing runner and static-mutant policy. */
const base = JSON.parse(readFileSync(new URL('./stryker.config.json', import.meta.url), 'utf8'));

export default {
  ...base,
  "mutate": [
    "src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/**/__tests__/**",
    "!src/test/**"
  ],
  "reporters": [
    "clear-text",
    "progress",
    "html",
    "json"
  ],
  "htmlReporter": {
    "fileName": "reports/mutation/audit.html"
  },
  "jsonReporter": {
    "fileName": "reports/mutation/audit.json"
  },
  "thresholds": {
    "high": 100,
    "low": 100,
    "break": 100
  }
};
