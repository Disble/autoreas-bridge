import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

/** Extends the test-time `Window` with the Wails-injected globals adapters check for. */
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
      BrowserOpenURL?: (url: string) => void;
    };
  }
}

/** jsdom does not implement ResizeObserver; every component under test gets a no-op stub instead. */
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

/**
 * jsdom does not implement IntersectionObserver either, and HeroUI's
 * `Table.LoadMore` sentinel (react-aria's `useLoadMoreSentinel`) constructs a
 * real one on mount, which otherwise throws and aborts the render. Unlike
 * the ResizeObserver stub above, this one is controllable: tests that need
 * to simulate a load-more sentinel entering the viewport import
 * `triggerIntersectionObservers` and call it after the sentinel has mounted.
 */
class IntersectionObserverMock implements IntersectionObserver {
    static instances: IntersectionObserverMock[] = [];

    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly scrollMargin: string = '';
    readonly thresholds: readonly number[] = [];
    private target: Element | null = null;

    constructor(private readonly callback: IntersectionObserverCallback) {
        IntersectionObserverMock.instances.push(this);
    }

    observe(target: Element) {
        this.target = target;
    }

    unobserve() {
        this.target = null;
    }

    disconnect() {
        this.target = null;
        IntersectionObserverMock.instances = IntersectionObserverMock.instances.filter((instance) => instance !== this);
    }

    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }

    /** Test-only trigger: reports the currently-observed target's intersection state. */
    reportIntersection(isIntersecting: boolean) {
        if (!this.target) {
            return;
        }

        this.callback(
            [{ isIntersecting, target: this.target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
        );
    }
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
});

/**
 * Simulates every currently-observed IntersectionObserver sentinel becoming
 * (or stopping being) visible. Used by tests exercising `Table.LoadMore`'s
 * near-bottom trigger, since jsdom never fires a real intersection.
 */
export function triggerIntersectionObservers(isIntersecting = true): void {
    for (const instance of IntersectionObserverMock.instances) {
        instance.reportIntersection(isIntersecting);
    }
}

// The registry is static, so it outlives any one test and every test file
// sharing a worker. A component that unmounts without disconnecting leaves its
// observer behind, and the next test's trigger then fires a callback belonging
// to a component that no longer exists -- which is exactly how the load-more
// windowing test came to pass alone and fail inside the full suite.
afterEach(() => {
    IntersectionObserverMock.instances = [];
});

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        configurable: true,
        value: ResizeObserverMock,
    });

    Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: IntersectionObserverMock,
    });

    // jsdom does not implement the Web Animations API; HeroUI's Tabs indicator
    // calls `element.getAnimations()` during its layout-effect transition, which
    // otherwise throws and aborts the whole render in every Tabs-based test.
    if (typeof Element.prototype.getAnimations !== 'function') {
        Object.defineProperty(Element.prototype, 'getAnimations', {
            writable: true,
            configurable: true,
            value: () => [],
        });
    }

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
