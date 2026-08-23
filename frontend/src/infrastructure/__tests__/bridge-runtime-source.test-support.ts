import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Installs the Wails runtime isolation every `bridge-runtime-source` suite
 * needs: a fresh module registry and fake timers per test, with `window.go`
 * and `window.runtime` deleted before and after so no test observes bindings
 * another test injected.
 *
 * Call it as the first statement inside a `describe` block. The module
 * registry reset is why each test imports `bridge-runtime-source.helpers`
 * dynamically inside its own body rather than at the top of the file.
 *
 * This lives in one place because the block is now shared by five suites. At
 * two copies repeating it was cheaper than importing it; at five it is a
 * clone group.
 */
export function useIsolatedWailsRuntime(): void {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });
}
