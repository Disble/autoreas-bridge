import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';

export const warningThreshold = 400;
export const hardLimit = 500;

const maxLinesPattern = /File has too many lines \((\d+)\)\. Maximum allowed is \d+\./u;

/**
 * Collects only max-lines warnings so the advisory path matches ESLint semantics.
 * This keeps the warning report aligned with the committed hard-fail rule source.
 */
export function collectFileSizeWarnings(results, cwd, nextWarningThreshold = warningThreshold, nextHardLimit = hardLimit) {
  return results
    .flatMap((result) =>
      result.messages
        .filter((message) => message.ruleId === 'max-lines')
        .map((message) => ({
          filePath: result.filePath,
          effectiveLines: parseEffectiveLines(message.message),
          warningThreshold: nextWarningThreshold,
          hardLimit: nextHardLimit,
        })),
    )
    .filter((warning) => warning.effectiveLines >= nextWarningThreshold)
    .map((warning) => ({
      path: normalizeRelativePath(cwd, warning.filePath),
      effectiveLines: warning.effectiveLines,
      warningThreshold: warning.warningThreshold,
      hardLimit: warning.hardLimit,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Formats frontend advisory output so hooks surface the 400-line risk clearly
 * while leaving the blocking 500-line ESLint rule unchanged.
 */
export function formatFileSizeWarnings(warnings) {
  if (warnings.length === 0) {
    return 'Frontend file size warnings: none.';
  }

  return [
    'Frontend file size warnings:',
    ...warnings.map(
      (warning) =>
        `- ${warning.path}: ${warning.effectiveLines} effective lines (warning threshold ${warning.warningThreshold}; hard limit ${warning.hardLimit})`,
    ),
    'Warnings do not fail the hook. Shrink the file before it crosses the hard limit.',
  ].join('\n');
}

export async function runFileSizeWarnings({
  cwd = process.cwd(),
  patterns = ['src/**/*.{ts,tsx}'],
  eslintFactory = (options) => new ESLint(options),
} = {}) {
  const eslint = eslintFactory({
    cwd,
    // Ignore the repo's flat config entirely. This check needs exactly one
    // rule, but inheriting eslint.config.js dragged in the full type-aware
    // preset, so counting lines paid for building a whole TypeScript program:
    // 47s of an 88s pre-commit gate. `max-lines` only needs the syntax tree to
    // tell blank lines and comments apart, so the parser runs without a
    // `project`/`projectService`. Measured: 47s -> ~2s, identical output.
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            ecmaFeatures: { jsx: true },
          },
        },
        rules: {
          'max-lines': ['warn', { max: warningThreshold, skipBlankLines: true, skipComments: true }],
        },
      },
    ],
  });

  const results = await eslint.lintFiles(patterns);
  return collectFileSizeWarnings(results, cwd, warningThreshold, hardLimit);
}

function parseEffectiveLines(message) {
  const match = message.match(maxLinesPattern);
  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1], 10);
}

function normalizeRelativePath(cwd, filePath) {
  return path.relative(cwd, filePath).split(path.sep).join('/');
}

async function main() {
  const warnings = await runFileSizeWarnings();
  process.stdout.write(`${formatFileSizeWarnings(warnings)}\n`);
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (executedPath === modulePath) {
  main().catch((error) => {
    process.stderr.write(`frontend file size warning check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
