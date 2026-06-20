import js from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import checkFilePlugin from 'eslint-plugin-check-file';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactDoctor from 'eslint-plugin-react-doctor';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import * as tsParser from '@typescript-eslint/parser';

import {
  appDeliverySyntaxRules,
  colocationSyntaxRules,
  downgradeRuleSeverities,
  dumbUiEffectSyntaxRules,
  featureHookAnatomySyntaxRules,
  helperDocumentationContexts,
  importXExtensions,
  publicConstantDocumentationContexts,
  publicHookDocumentationContexts,
  publicTypeContractDocumentationContexts,
  readonlyUiPropsBoundarySyntaxRules,
  tsxLayeringSyntaxRules,
  uiExportDocumentationContexts,
} from './eslint/architecture-rules.js';

const reactDoctorWarnRules = downgradeRuleSeverities(reactDoctor.configs.recommended.rules);

export default [
  js.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  reactPlugin.configs.flat['jsx-runtime'],
  {
    ignores: ['dist/*', 'scripts/*', 'coverage/*', 'wailsjs/**/*'],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
      },
    },
    plugins: {
      sonarjs: sonarjsPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          bun: true,
          project: './tsconfig.json',
        }),
        createNodeResolver({
          extensions: importXExtensions,
        }),
      ],
    },
    rules: {
      'import/default': 'off',
      'import/export': 'off',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-unresolved': 'off',
      'no-redeclare': 'off',
      'import-x/no-cycle': ['error', { maxDepth: 1 }],
      'import-x/no-duplicates': 'error',
      'import-x/no-unresolved': 'error',
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-all-duplicated-branches': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-redundant-boolean': 'warn',
      'sonarjs/no-small-switch': 'warn',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      // TypeScript is the source of truth for undefined symbols and browser/DOM
      // globals (SVGSVGElement, URLSearchParams, the React type namespace, ...).
      // `bun run typecheck` covers it; ESLint's no-undef only produces false
      // positives here. This mirrors the official typescript-eslint guidance.
      'no-undef': 'off',
      // Use the TS-aware unused-vars rule: it correctly ignores parameter names
      // that exist only as documentation inside function-type annotations, while
      // still catching genuinely unused locals and imports.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  // Tests are exempt from architecture/colocation/anatomy/JSDoc rules and may
  // keep unused mock parameters — they describe behavior, not production shape.
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    plugins: {
      jsdoc: jsdocPlugin,
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
  // Rules-of-hooks safety net (kept from the legacy config; no other plugin
  // replaces the exhaustive-deps / rules-of-hooks guarantees).
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/__tests__/**/*.{ts,tsx}'],
    plugins: {
      'react-doctor': reactDoctor,
    },
    rules: {
      ...reactDoctorWarnRules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'check-file': checkFilePlugin,
    },
    rules: {
      'check-file/filename-blocklist': [
        'error',
        {
          'src/**/utils.ts': '*.helpers.ts',
          'src/**/Utils.ts': '*.helpers.ts',
        },
      ],
      'check-file/folder-match-with-fex': [
        'error',
        {
          'src/**/*.test.ts': '**/__tests__/',
          'src/**/*.test.tsx': '**/__tests__/',
        },
      ],
      'check-file/folder-naming-convention': [
        'error',
        {
          'src/features/*/': 'KEBAB_CASE',
        },
      ],
    },
  },
  // Every .tsx is presentational: no direct Wails bindings.
  {
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../wailsjs/*', './wailsjs/*', '../../wailsjs/*', '../../../wailsjs/*', '../../../../wailsjs/*', '**/wailsjs/*'],
              message:
                'Feature Boundary: UI components (.tsx) cannot import Wails bindings directly. Use the colocated feature hook (use-*.ts) instead.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...tsxLayeringSyntaxRules],
    },
  },
  // Delivery Layer Rule: App.tsx + src/app/** are composition only.
  {
    files: ['src/App.tsx', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../wailsjs/*', './wailsjs/*', '../../wailsjs/*', '../../../wailsjs/*', '**/wailsjs/*'],
              message:
                'Delivery Rule: app/ composition files cannot import Wails bindings directly. Move runtime access behind a feature entrypoint.',
            },
            {
              group: ['**/features/**/use-*', '**/shared/**/use-*'],
              message: 'Delivery Rule: app/ composition files cannot import custom hooks directly. Render a feature entrypoint component instead.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...appDeliverySyntaxRules],
    },
  },
  // Feature dumb-UI views: no effects, strict colocation, readonly props, JSDoc.
  {
    files: ['src/features/**/*.tsx', 'src/components/**/*.tsx'],
    ignores: ['src/**/__tests__/**/*', 'src/**/*.test.tsx'],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message: 'Strict Colocation: Zod schemas must live in a dedicated *.schema.ts file, never inside a component or hook.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...tsxLayeringSyntaxRules,
        ...dumbUiEffectSyntaxRules,
        ...colocationSyntaxRules,
        ...readonlyUiPropsBoundarySyntaxRules,
      ],
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: uiExportDocumentationContexts,
          require: {
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
    },
  },
  // Feature hooks: 10-step anatomy + colocation.
  {
    files: ['src/features/**/use-*.ts'],
    ignores: ['src/**/__tests__/**/*', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message: 'Strict Colocation: Zod schemas must live in a dedicated *.schema.ts file, never inside a component or hook.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...featureHookAnatomySyntaxRules, ...colocationSyntaxRules],
    },
  },
  // Public hooks need JSDoc (production code only).
  {
    files: ['src/features/**/use-*.ts', 'src/hooks/use-*.ts'],
    ignores: ['src/**/__tests__/**/*', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: publicHookDocumentationContexts,
          require: {
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
    },
  },
  // Type contracts: every Props field readonly + JSDoc on exported contracts.
  {
    files: ['src/features/**/*.types.ts', 'src/components/**/*.types.ts'],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSInterfaceDeclaration[id.name=/Props$/] TSPropertySignature[readonly!=true]',
          message: 'Type Contract Rule: every Props field must be declared as readonly.',
        },
      ],
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: publicTypeContractDocumentationContexts,
          require: {
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
    },
  },
  // Constants files: JSDoc on every exported constant.
  {
    files: ['src/**/*.constants.ts'],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: publicConstantDocumentationContexts,
          require: {
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
    },
  },
  // Schema files: JSDoc on exported constants and type contracts.
  {
    files: ['src/**/*.schema.ts'],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: [...publicConstantDocumentationContexts, ...publicTypeContractDocumentationContexts],
          require: {
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
    },
  },
  // Helpers: no inline interfaces/types + mandatory JSDoc (constraint #6).
  {
    files: ['src/features/**/*.helpers.ts', 'src/components/**/*.helpers.ts'],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSInterfaceDeclaration',
          message: 'Helper Contract Rule: interfaces must be declared in a separate *.types.ts file, not inside helpers.',
        },
        {
          selector: 'TSTypeAliasDeclaration',
          message: 'Helper Contract Rule: type aliases must be declared in a separate *.types.ts file, not inside helpers.',
        },
      ],
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: helperDocumentationContexts,
          require: {
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
    },
  },
];
