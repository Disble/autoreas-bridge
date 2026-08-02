import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectFileSizeWarnings,
  formatFileSizeWarnings,
} from '../check-file-size-warnings.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(currentDir, '..', '..');

function readFrontendFile(...segments) {
  return readFileSync(path.join(frontendRoot, ...segments), 'utf8');
}

function readPackageJson() {
  return JSON.parse(readFrontendFile('package.json'));
}

/** Every `.ts`/`.tsx` file under `src/`, as `{ path, source }`, for source-wide contract assertions. */
function readFrontendSourceFiles(relativeDir = 'src') {
  const absoluteDir = path.join(frontendRoot, relativeDir);

  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      return readFrontendSourceFiles(relativePath);
    }

    if (!/\.tsx?$/.test(entry.name)) {
      return [];
    }

    return [{ path: relativePath, source: readFrontendFile(relativePath) }];
  });
}

function readFallowConfig() {
  const withoutCommentLines = readFrontendFile('.fallowrc.json')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

  return JSON.parse(withoutCommentLines);
}

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

describe('frontend dependency contracts', () => {
  it('declares @dnd-kit/react as a production dependency when feature code imports it directly', () => {
    const hosterPriorityEditorSource = readFrontendFile(
      'src',
      'features',
      'download',
      'ui',
      'HosterPriorityEditor',
      'HosterPriorityEditor.tsx',
    );
    const packageJson = readPackageJson();

    expect(hosterPriorityEditorSource).toContain("from '@dnd-kit/react'");
    expect(packageJson.dependencies['@dnd-kit/react']).toBeDefined();
  });

  // AGENTS.md rule 11: drag-and-drop must be pointer-based (@dnd-kit), because native
  // HTML5 DnD -- which react-aria's mouse drag path uses -- does not fire in Wails
  // WebView2. react-aria-components reaches the bundle only via @heroui/react.
  it('keeps react-aria-components out of app source and out of direct dependencies', () => {
    const packageJson = readPackageJson();

    expect(packageJson.dependencies['react-aria-components']).toBeUndefined();
    expect(readFrontendSourceFiles().filter((file) => file.source.includes("from 'react-aria-components'"))).toEqual([]);
  });

  it('keeps eslint as a script-only devDependency and scopes any Fallow exception to eslint alone', () => {
    const fileSizeScriptSource = readFrontendFile('scripts', 'check-file-size-warnings.mjs');
    const packageJson = readPackageJson();
    const fallowConfig = readFallowConfig();

    expect(fileSizeScriptSource).toContain("from 'eslint'");
    expect(packageJson.devDependencies.eslint).toBeDefined();
    expect(packageJson.dependencies.eslint).toBeUndefined();
    expect(fallowConfig.ignoreDependencies).toContain('eslint');
    expect(fallowConfig.ignoreDependencies).not.toContain('tailwindcss');
    expect(fallowConfig.ignoreDependencies).not.toContain('react-aria-components');
  });

  it('declares tailwindcss as a production dependency when the app entry stylesheet imports it', () => {
    const appStylesheetSource = readFrontendFile('src', 'style.css');
    const packageJson = readPackageJson();

    expect(appStylesheetSource).toContain('@import "tailwindcss";');
    expect(packageJson.dependencies.tailwindcss).toBe('4.2.2');
    expect(packageJson.devDependencies.tailwindcss).toBeUndefined();
  });
});
