import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';

/** Effective-line count above which a file is reported as a warning. */
export const warningThreshold = 400;
/** Effective-line count ESLint's max-lines rule fails on; this script only warns below it. */
export const hardLimit = 500;

/** Matches ESLint's max-lines message so the effective count can be read back out of it. */
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

/**
 * Lints the tree for max-lines and returns only the files between the warning
 * threshold and the hard limit, which is what makes this advisory rather than a gate.
 * @param {object} [options] Injection seams, all defaulted for the normal run.
 * @returns {Promise<object[]>} One entry per warned file.
 */
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

/**
 * Reads the effective line count out of one ESLint max-lines message.
 * @param {string} message The rule's message text.
 * @returns {number} The count, or 0 when the message is not a max-lines one.
 */
function parseEffectiveLines(message) {
  const match = message.match(maxLinesPattern);
  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1], 10);
}

/**
 * Renders a lint result path relative to the working directory, with forward slashes.
 * @param {string} cwd The directory paths are reported against.
 * @param {string} filePath The absolute path ESLint reported.
 * @returns {string} The repo-relative path.
 */
function normalizeRelativePath(cwd, filePath) {
  return path.relative(cwd, filePath).split(path.sep).join('/');
}

/**
 * Runs the warning pass over the whole tree and prints its report.
 * @returns {Promise<void>} Resolves once the report has been written.
 */
async function main() {
  const warnings = await runFileSizeWarnings();
  process.stdout.write(`${formatFileSizeWarnings(warnings)}\n`);
}

/** The script node was actually asked to run, or '' when there is none. */
const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
/** This module's own path, compared against executedPath to detect a direct run. */
const modulePath = fileURLToPath(import.meta.url);

if (executedPath === modulePath) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`frontend file size warning check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
