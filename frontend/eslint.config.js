// Repo-owned ESLint rules only.
//
// Architecture governance used to come from the `dlinter-ts-react` preset,
// which bundled typescript-eslint, react, react-hooks, sonarjs, jsdoc,
// import-x, check-file and eslint-plugin-react-doctor behind one
// `createRecommendedConfig()` call. It was removed on 2026-08-11: react-doctor
// now carries that job, invoked by `dharness check` and configured in
// `doctor.config.json`, with structural rules (`require-jsdoc`,
// `max-file-lines`, `role-file-shape`, `folder-ownership`) coming from
// `dharness-eslint-plugin`.
//
// What stays here is only what this repository decided for itself and no
// external preset knows about. Everything below is either an ADR guard or a
// hard-fail path asserted by a test — do not fold it back into a preset.
import tsParser from '@typescript-eslint/parser';
import reactDoctor from 'eslint-plugin-react-doctor';
// dharness:eslint-import begin — rewritten by `dharness sync`; edits here are lost.
import dharnessPlugin from "dharness-eslint-plugin";
import dharnessLayer from "../.dharness/eslint.config.js";
// dharness:eslint-import end

export default [
  // dharness:eslint-layer begin — rewritten by `dharness sync`; edits here are lost.
  ...dharnessLayer({ plugin: dharnessPlugin }),
  // dharness:eslint-layer end
  {
    // react-doctor is registered but none of its 787 rules are switched on
    // here. The governance pass is the react-doctor CLI that `dharness check`
    // runs over the staged change, and enabling the same rules again in the
    // `frontend-lint` job would just pay for them twice.
    //
    // Registering the plugin is still required: without the rule definitions,
    // every `// eslint-disable-next-line react-doctor/...` comment already in
    // the source becomes a hard "Definition for rule was not found" error.
    plugins: { 'react-doctor': reactDoctor },
    linterOptions: {
      // A `react-doctor/...` disable comment looks unused from here precisely
      // because this pass leaves those rules off — the CLI pass is the one it
      // is written for. Reporting them would train people to delete
      // suppressions that the real governance run still needs.
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    ignores: [
      'wailsjs/**/*',
      // Stryker's scratch tree. It contains generated copies of src/ and, left
      // unignored, it produced 6395 of the 6415 findings a bare `eslint .`
      // reported on 2026-08-11.
      '.dlinter-mutation-tmp/**/*',
      'dist/**/*',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // The hard-fail half of the shared 400-warn / 500-fail file size policy.
      // tools/checkgofilesize/repository_policy_test.go asserts this exact
      // line, so keep the formatting intact.
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      // ADR-011: modules are imported by concrete path, never through a
      // barrel. This catches the explicit `.../index` form; the directory
      // form stops resolving once the barrels are deleted, and
      // `bun run check:no-barrels` keeps them from coming back.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/index'],
              message:
                'Import the concrete module file instead of a barrel (ADR-011: docs/adr/011-no-barrel-files.md).',
            },
          ],
        },
      ],
    },
  },
  // Vitest mock hygiene — local rules, proposed upstream in
  // docs/dlinter-vitest-mock-hygiene-proposal.md and never adopted there.
  // importOriginal-based partial package mocks break under
  // test.deps.optimizer, and per-test timeout raises hide performance
  // regressions instead of fixing them.
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
