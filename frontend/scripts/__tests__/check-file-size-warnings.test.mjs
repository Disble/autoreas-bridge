import { describe, expect, it } from 'vitest';

import {
  collectFileSizeWarnings,
  formatFileSizeWarnings,
} from '../check-file-size-warnings.mjs';

describe('collectFileSizeWarnings', () => {
  it('keeps max-lines findings at or above the warning threshold in stable path order', () => {
    const warnings = collectFileSizeWarnings([
      {
        filePath: '/repo/src/z-last.tsx',
        messages: [
          {
            ruleId: 'max-lines',
            severity: 1,
            message: 'File has too many lines (430). Maximum allowed is 400.',
          },
        ],
      },
      {
        filePath: '/repo/src/a-first.ts',
        messages: [
          {
            ruleId: 'max-lines',
            severity: 1,
            message: 'File has too many lines (400). Maximum allowed is 400.',
          },
          {
            ruleId: 'sonarjs/cognitive-complexity',
            severity: 1,
            message: 'ignore me',
          },
        ],
      },
      {
        filePath: '/repo/src/ignored.ts',
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 2,
            message: 'not a file size warning',
          },
        ],
      },
    ], '/repo', 400, 500);

    expect(warnings).toEqual([
      {
        path: 'src/a-first.ts',
        effectiveLines: 400,
        warningThreshold: 400,
        hardLimit: 500,
      },
      {
        path: 'src/z-last.tsx',
        effectiveLines: 430,
        warningThreshold: 400,
        hardLimit: 500,
      },
    ]);
  });

  it('returns no warnings when eslint results do not include max-lines findings', () => {
    expect(
      collectFileSizeWarnings(
        [
          {
            filePath: '/repo/src/clean.ts',
            messages: [{ ruleId: 'no-console', severity: 1, message: 'ignore me' }],
          },
        ],
        '/repo',
        400,
        500,
      ),
    ).toEqual([]);
  });
});

describe('formatFileSizeWarnings', () => {
  it('prints a readable advisory report', () => {
    expect(
      formatFileSizeWarnings([
        {
          path: 'src/example.tsx',
          effectiveLines: 427,
          warningThreshold: 400,
          hardLimit: 500,
        },
      ]),
    ).toContain('src/example.tsx: 427 effective lines (warning threshold 400; hard limit 500)');
  });

  it('prints an explicit clean message when there are no warnings', () => {
    expect(formatFileSizeWarnings([])).toBe('Frontend file size warnings: none.');
  });
});
