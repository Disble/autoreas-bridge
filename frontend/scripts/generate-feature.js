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

/** Go binding the TODO asks the author to add (or replace with an existing one). */
const bindingName = `Get${componentName}`;

/** Import prefix from `src/features/<feature>/ui/<Component>/` to `src/shared/`. */
const sharedPath = '../../../../shared';

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
// The hook reads backend data through `useBridgeQuery` + `toAsyncView`
// (ADR-032 §4): the placeholder loader rejects until the author wires the
// binding, so the scaffold shows the failure state instead of invented data.
/** Relative path -> file contents for every module this scaffold writes. */
const files = new Map([
  [`${componentName}.tsx`, `import { Alert } from '@heroui/react';
import { AirisEmptyState } from '${sharedPath}/ui/AirisEmptyState/AirisEmptyState';
import { LoadingBars } from '${sharedPath}/ui/LoadingBars/LoadingBars';
import { ${componentName}EmptyDescription, ${componentName}EmptyTitle, ${componentName}LoadingLabel } from './${kebabComponentName}.constants';
import type { ${componentName}Props } from './${kebabComponentName}.types';
import { use${componentName} } from './use-${kebabComponentName}';

/** Renders the ${componentName} scaffold: exactly one of loading, failure, empty or the data. */
export function ${componentName}(props: Readonly<${componentName}Props>) {
  const { title, description, view, isBusy } = use${componentName}(props);

  return (
    <section aria-busy={isBusy} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
      {view.kind === 'loading' && <LoadingBars count={3} label={${componentName}LoadingLabel} />}
      {view.kind === 'failure' && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{view.message}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {view.kind === 'empty' && (
        <AirisEmptyState description={${componentName}EmptyDescription} kind="caught-up" size="section" title={${componentName}EmptyTitle} />
      )}
      {view.kind === 'ready' && (
        <ul>
          {view.data.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
`],
  [`use-${kebabComponentName}.ts`, `import { useMemo } from 'react';
import { toAsyncView } from '${sharedPath}/query/async-view/async-view.helpers';
import { useBridgeQuery } from '${sharedPath}/query/use-bridge-query/use-bridge-query';
import { ${componentName}QueryKey } from './${kebabComponentName}.constants';
import type { ${componentName}Props } from './${kebabComponentName}.types';
import { get${componentName}Description, get${componentName}Title, load${componentName} } from './${kebabComponentName}.helpers';

/**
 * Resolves the ${componentName} view model so the TSX file stays presentational.
 */
export function use${componentName}(props: Readonly<${componentName}Props>) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  // TODO(bridge-data): add the Go binding ${bindingName} (or reuse an existing one) behind a source
  // port in src/infrastructure, replace load${componentName} with that port method, and pass
  // \`module\` (the backend module it reads) so the query waits for its readiness.
  const query = useBridgeQuery({ queryKey: ${componentName}QueryKey, queryFn: load${componentName} });

  // 5. Derived State (useMemo)
  const title = useMemo(() => get${componentName}Title(props.title), [props.title]);
  const description = useMemo(() => get${componentName}Description(props.description), [props.description]);
  const view = toAsyncView(query);
  const isBusy = view.kind === 'ready' && view.isRefreshing;

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return {
    title,
    description,
    view,
    isBusy,
  };
}
`],
  [`${kebabComponentName}.types.ts`, `/** Public props contract for the ${componentName} scaffold. */
export interface ${componentName}Props {
  readonly title?: string;
  readonly description?: string;
}
`],
  [`${kebabComponentName}.constants.ts`, `import { defineQueryKeys } from '${sharedPath}/query/query-keys/query-keys.helpers';

/** Default title used by the ${componentName} scaffold. */
export const ${componentName}DefaultTitle = '${componentName}';
/** Default description used by the ${componentName} scaffold. */
export const ${componentName}DefaultDescription = 'Replace this scaffold with real feature content.';
/** Accessible name of the ${componentName} loading region. */
export const ${componentName}LoadingLabel = 'Loading ${componentName}';
/** Title of the ${componentName} empty state. */
export const ${componentName}EmptyTitle = 'Nothing here yet';
/** Description of the ${componentName} empty state. */
export const ${componentName}EmptyDescription = 'Replace this empty state with the real next step.';
/** Query key of the ${componentName} data; move it to the context's \`${featureName}\` keys when they exist. */
export const ${componentName}QueryKey = defineQueryKeys('${featureName}').key('${kebabComponentName}');
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

/**
 * TODO(bridge-data): placeholder for the source port method that calls the Go binding ${bindingName}.
 * It rejects so the scaffold shows the failure state; it never invents data.
 */
export function load${componentName}(): Promise<readonly string[]> {
  return Promise.reject(new Error('${componentName} is not bound to ${bindingName} yet'));
}
`],
  [path.join('__tests__', `${kebabComponentName}.helpers.test.ts`), `import { describe, expect, it } from 'vitest';
import { get${componentName}Description, get${componentName}Title, load${componentName} } from '../${kebabComponentName}.helpers';

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

describe('load${componentName}', () => {
  it('rejects until the binding is wired', async () => {
    await expect(load${componentName}()).rejects.toThrow('${componentName} is not bound to ${bindingName} yet');
  });
});
`],
  [path.join('__tests__', `use-${kebabComponentName}.test.ts`), `import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createBridgeQueryTestWrapper } from '../${sharedPath}/query/test-support/bridge-query.test-support';
import { use${componentName} } from '../use-${kebabComponentName}';

describe('use${componentName}', () => {
  it('returns explicit values when provided', () => {
    const { result } = renderHook(() => use${componentName}({ title: 'A', description: 'B' }), createBridgeQueryTestWrapper());

    expect(result.current).toMatchObject({ title: 'A', description: 'B' });
  });

  it('returns fallback values when omitted and loads before anything else', () => {
    const { result } = renderHook(() => use${componentName}({}), createBridgeQueryTestWrapper());

    expect(result.current).toMatchObject({
      title: '${componentName}',
      description: 'Replace this scaffold with real feature content.',
      view: { kind: 'loading' },
      isBusy: false,
    });
  });

  it('shows the failure state while the binding is not wired', async () => {
    const { result } = renderHook(() => use${componentName}({}), createBridgeQueryTestWrapper());

    await waitFor(() => expect(result.current.view).toEqual({
      kind: 'failure',
      code: 'internal',
      message: '${componentName} is not bound to ${bindingName} yet',
    }));
  });
});
`],
  [path.join('__tests__', `${componentName}.test.tsx`), `import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createBridgeQueryTestWrapper } from '../${sharedPath}/query/test-support/bridge-query.test-support';
import { ${componentName} } from '../${componentName}';

describe('${componentName}', () => {
  it('renders explicit content', () => {
    render(<${componentName} title="Custom title" description="Custom description" />, createBridgeQueryTestWrapper());

    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.getByText('Custom description')).toBeInTheDocument();
  });

  it('renders fallback content and the loading region, without the failure, when props are omitted', () => {
    render(<${componentName} />, createBridgeQueryTestWrapper());

    expect(screen.getByText('${componentName}')).toBeInTheDocument();
    expect(screen.getByText('Replace this scaffold with real feature content.')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading ${componentName}' })).toBeInTheDocument();
    expect(screen.queryByText('${componentName} is not bound to ${bindingName} yet')).not.toBeInTheDocument();
  });

  it('renders the failure Alert instead of the loading region once the load fails', async () => {
    render(<${componentName} />, createBridgeQueryTestWrapper());

    expect(await screen.findByText('${componentName} is not bound to ${bindingName} yet')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading ${componentName}' })).not.toBeInTheDocument();
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
