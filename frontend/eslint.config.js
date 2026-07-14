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
  // Vitest mock hygiene — local enforcement of the rules proposed to dlinter
  // in docs/dlinter-vitest-mock-hygiene-proposal.md. importOriginal-based
  // partial package mocks break under test.deps.optimizer, and per-test
  // timeout raises hide performance regressions instead of fixing them.
  {
    files: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/][arguments.0.value=/^[^./]/] > :function[params.length>0]",
          message:
            'Partial package mocks via importOriginal break under deps.optimizer. Use vi.spyOn on the module namespace (keep the package out of optimizer.include) or a full vi.mock factory. See docs/dlinter-vitest-mock-hygiene-proposal.md.',
        },
        {
          selector:
            "CallExpression[callee.name=/^(it|test)$/][arguments.length>2]",
          message:
            'Per-test timeout overrides hide performance regressions. Fix the slow import or contention instead of raising the 5s default. See docs/dlinter-vitest-mock-hygiene-proposal.md.',
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(it|test)$/][arguments.length>2]",
          message:
            'Per-test timeout overrides hide performance regressions. Fix the slow import or contention instead of raising the 5s default. See docs/dlinter-vitest-mock-hygiene-proposal.md.',
        },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='testTimeout'], Property[key.name='hookTimeout']",
          message:
            'Global Vitest timeout overrides mask import-cost regressions. Keep the 5s default and fix the root cause (deps.optimizer, plugin scoping). See docs/dlinter-vitest-mock-hygiene-proposal.md.',
        },
      ],
    },
  },
];
