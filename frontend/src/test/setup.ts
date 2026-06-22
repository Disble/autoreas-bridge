import '@testing-library/jest-dom/vitest';

declare global {
  interface Window {
    go?: {
      main?: {
        App?: Record<string, (...args: never[]) => unknown>;
      };
    };
    runtime?: {
      EventsOn?: (...args: unknown[]) => () => void;
      EventsOnMultiple?: (...args: unknown[]) => () => void;
    };
  }
}

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
});

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        configurable: true,
        value: ResizeObserverMock,
    });

    if (typeof window.matchMedia !== 'function') {
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            configurable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
            }),
        });
    }
}
