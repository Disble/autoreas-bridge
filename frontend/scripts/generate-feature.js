import fs from 'node:fs';
import path from 'node:path';

/** CLI arguments after the node executable and this script: `<featureName> <ComponentName>`. */
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('\x1b[31mError: Missing arguments\x1b[0m');
  console.log('Usage: bun run generate:feature <featureName> <ComponentName>');
  console.log('Example: bun run generate:feature dashboard BridgeStatusCard');
  process.exit(1);
}

/** Feature slice directory under `src/features`, lowercased so the path is stable. */
const featureName = args[0].toLowerCase();

/** Component name in PascalCase; it names the folder, the `.tsx`, and every symbol. */
const componentName = args[1];

/** Converts PascalCase to the kebab-case this codebase uses for non-component filenames. */
function toKebabCase(value) {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Filename stem for the colocated hook, helpers, types, and constants modules. */
const kebabComponentName = toKebabCase(componentName);

/** Absolute path of the component folder this run scaffolds. */
const rootDir = path.resolve(import.meta.dirname, '..', 'src', 'features', featureName, 'ui', componentName);

/** Colocated `__tests__` folder; every scaffolded module ships with a test. */
const testDir = path.join(rootDir, '__tests__');

for (const directory of [rootDir, testDir]) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

// No index.ts barrel: modules are consumed by concrete path across this
// codebase, so a scaffolded barrel is born unimported and stays that way.
// No `.schema.ts` either, for the same reason — see the generator test.
/** Relative path -> file contents for every module this scaffold writes. */
const files = new Map([
  [`${componentName}.tsx`, `import type { ${componentName}Props } from './${kebabComponentName}.types';
import { use${componentName} } from './use-${kebabComponentName}';

/** Renders the ${componentName} scaffold using the colocated feature hook. */
export function ${componentName}(props: Readonly<${componentName}Props>) {
  const { title, description } = use${componentName}(props);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
    </section>
  );
}
`],
  [`use-${kebabComponentName}.ts`, `import { useMemo } from 'react';
import type { ${componentName}Props } from './${kebabComponentName}.types';
import { get${componentName}Description, get${componentName}Title } from './${kebabComponentName}.helpers';

/**
 * Resolves the ${componentName} view model so the TSX file stays presentational.
 */
export function use${componentName}(props: Readonly<${componentName}Props>) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const title = useMemo(() => get${componentName}Title(props.title), [props.title]);
  const description = useMemo(() => get${componentName}Description(props.description), [props.description]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return {
    title,
    description,
  };
}
`],
  [`${kebabComponentName}.types.ts`, `/** Public props contract for the ${componentName} scaffold. */
export interface ${componentName}Props {
  readonly title?: string;
  readonly description?: string;
}
`],
  [`${kebabComponentName}.constants.ts`, `/** Default title used by the ${componentName} scaffold. */
export const ${componentName}DefaultTitle = '${componentName}';
/** Default description used by the ${componentName} scaffold. */
export const ${componentName}DefaultDescription = 'Replace this scaffold with real feature content.';
`],
  [`${kebabComponentName}.helpers.ts`, `import { ${componentName}DefaultDescription, ${componentName}DefaultTitle } from './${kebabComponentName}.constants';

/**
 * Resolves the scaffold title while keeping presentation fallback logic out of the UI and hook.
 */
export function get${componentName}Title(title?: string) {
  return title ?? ${componentName}DefaultTitle;
}

/**
 * Resolves the scaffold description so placeholder behavior stays in a pure helper.
 */
export function get${componentName}Description(description?: string) {
  return description ?? ${componentName}DefaultDescription;
}
`],
  [path.join('__tests__', `${kebabComponentName}.helpers.test.ts`), `import { describe, expect, it } from 'vitest';
import { get${componentName}Description, get${componentName}Title } from '../${kebabComponentName}.helpers';

describe('get${componentName}Title', () => {
  it('returns explicit title when provided', () => {
    expect(get${componentName}Title('Custom title')).toBe('Custom title');
  });

  it('returns fallback title when omitted', () => {
    expect(get${componentName}Title()).toBe('${componentName}');
  });
});

describe('get${componentName}Description', () => {
  it('returns explicit description when provided', () => {
    expect(get${componentName}Description('Custom description')).toBe('Custom description');
  });

  it('returns fallback description when omitted', () => {
    expect(get${componentName}Description()).toBe('Replace this scaffold with real feature content.');
  });
});
`],
  [path.join('__tests__', `use-${kebabComponentName}.test.ts`), `import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { use${componentName} } from '../use-${kebabComponentName}';

describe('use${componentName}', () => {
  it('returns explicit values when provided', () => {
    const { result } = renderHook(() => use${componentName}({ title: 'A', description: 'B' }));

    expect(result.current).toEqual({
      title: 'A',
      description: 'B',
    });
  });

  it('returns fallback values when omitted', () => {
    const { result } = renderHook(() => use${componentName}({}));

    expect(result.current).toEqual({
      title: '${componentName}',
      description: 'Replace this scaffold with real feature content.',
    });
  });
});
`],
  [path.join('__tests__', `${componentName}.test.tsx`), `import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ${componentName} } from '../${componentName}';

describe('${componentName}', () => {
  it('renders explicit content', () => {
    render(<${componentName} title="Custom title" description="Custom description" />);

    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.getByText('Custom description')).toBeInTheDocument();
  });

  it('renders fallback content when props are omitted', () => {
    render(<${componentName} />);

    expect(screen.getByText('${componentName}')).toBeInTheDocument();
    expect(screen.getByText('Replace this scaffold with real feature content.')).toBeInTheDocument();
  });
});
`],
]);

for (const [relativePath, content] of files.entries()) {
  const filePath = path.join(rootDir, relativePath);

  if (fs.existsSync(filePath)) {
    console.log(`\x1b[33mSkipped\x1b[0m: ${relativePath} already exists.`);
    continue;
  }

  fs.writeFileSync(filePath, content);
  console.log(`\x1b[32mCreated\x1b[0m: ${path.relative(process.cwd(), filePath)}`);
}

console.log('\n\x1b[32mSuccess: Feature component generated successfully!\x1b[0m');
