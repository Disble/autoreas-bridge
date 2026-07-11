// Architecture governance comes from the dlinter-ts-react package — the
// extracted, published successor of the rules that used to live in this repo
// (eslint/architecture-rules.js + the structural checker). The Wails edge is
// consumer configuration, not a preset: this repo defines what
// "infrastructure" means for itself.
import { createRecommendedConfig } from 'dlinter-ts-react';

export default [
  {
    ignores: ['wailsjs/**/*'],
  },
  ...createRecommendedConfig({
    infrastructure: {
      importPatterns: ['(^|/)wailsjs(/|$)'],
      runtimeGlobals: ['window.go'],
    },
  }),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
];
