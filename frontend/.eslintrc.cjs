module.exports = {
  root: true,
  ignorePatterns: ['dist/', 'wailsjs/'],
  env: {
    browser: true,
    es2021: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  plugins: ['react', 'react-hooks', '@typescript-eslint', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      rules: {
        'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      files: ['src/App.tsx', 'src/app/**/*.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../wailsjs/*', './wailsjs/*', '../../wailsjs/*', '**/wailsjs/*'],
                message:
                  'Delivery Layer Rule: App composition files cannot import Wails bindings directly. Move that behavior into a feature hook.',
              },
              {
                group: ['**/features/**/use-*'],
                message:
                  'Delivery Layer Rule: composition files cannot import hooks directly. Render a feature entrypoint component instead.',
              },
            ],
          },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "ImportDeclaration[source.value='react'] ImportSpecifier[imported.name=/^use(State|Reducer|Effect|Memo|Callback|Ref)$/]",
            message:
              'Delivery Layer Rule: App composition files cannot import React state/effect hooks.',
          },
        ],
      },
    },
    {
      files: ['src/features/**/*.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../wailsjs/*', '../../wailsjs/*', '../../../wailsjs/*', '**/wailsjs/*'],
                message:
                  'Dumb UI Rule: feature .tsx files cannot import Wails bindings. Use the colocated hook instead.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/features/**/*.tsx', 'src/features/**/use-*.ts'],
      excludedFiles: ['src/features/**/__tests__/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'zod',
                message:
                  'Strict Colocation: schemas belong in *.schema.ts, never inside a feature component or hook.',
              },
            ],
          },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'Program > VariableDeclaration',
            message:
              'Strict Colocation: root-level variables are forbidden in feature components/hooks. Move them to *.constants.ts or inside the function body.',
          },
          {
            selector: 'Program > FunctionDeclaration:not(:has(Identifier[id.name=/^(use[A-Z]|[A-Z])/]))',
            message:
              'Strict Colocation: root-level helper functions are forbidden in feature components/hooks. Move them to *.helpers.ts.',
          },
          {
            selector: 'Program > ExportNamedDeclaration > VariableDeclaration',
            message:
              'Strict Colocation: export feature components and hooks as named function declarations, not root-level consts.',
          },
          {
            selector: 'Program > ExportDefaultDeclaration > ArrowFunctionExpression',
            message:
              'Strict Colocation: export feature components and hooks as named function declarations.',
          },
          {
            selector: 'TSInterfaceDeclaration',
            message:
              'Strict Colocation: interfaces must be declared in a separate *.types.ts file, not inside a feature component or hook.',
          },
          {
            selector: 'TSTypeAliasDeclaration',
            message:
              'Strict Colocation: type aliases must be declared in a separate *.types.ts file, not inside a feature component or hook.',
          },
        ],
      },
    },
    {
      files: ['src/features/**/*.types.ts', 'src/components/**/*.types.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'TSInterfaceDeclaration[id.name=/Props$/] TSPropertySignature[readonly!=true]',
            message: 'Props Contract Rule: every Props field must be declared as readonly.',
          },
        ],
      },
    },
    {
      files: ['src/features/**/*.helpers.ts'],
      rules: {
        'jsdoc/require-jsdoc': [
          'error',
          {
            contexts: [
              'ExportNamedDeclaration > FunctionDeclaration',
              'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
            ],
            require: {
              FunctionDeclaration: false,
              ArrowFunctionExpression: false,
              FunctionExpression: false,
            },
          },
        ],
      },
    },
  ],
};
