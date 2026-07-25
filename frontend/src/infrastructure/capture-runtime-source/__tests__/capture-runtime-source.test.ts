import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('capture-runtime-source', () => {
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

  it('degrades subscribeCaptureTransactions to a no-op unsubscribe when the runtime is unavailable', async () => {
    const { createCaptureRuntimeSource } = await import('../capture-runtime-source.helpers');
    const source = createCaptureRuntimeSource();
    const listener = vi.fn();

    const unsubscribe = source.subscribeCaptureTransactions(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribes to the capture.transaction event and forwards rows to listeners', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const { createCaptureRuntimeSource } = await import('../capture-runtime-source.helpers');
    const source = createCaptureRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribeCaptureTransactions(listener);

    await vi.advanceTimersByTimeAsync(5000);

    const row = {
      requestId: 'req-1',
      capturedAtMs: 1000,
      kind: 'patch',
      route: '/api/animes/anime-1',
      transport: 'http',
      outcome: 'pending',
    };
    handlers.get('capture.transaction')?.(row);

    expect(listener).toHaveBeenCalledWith(row);
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('capture.transaction', expect.any(Function), -1);

    unsubscribe();
  });

  it('shares a single singleton across multiple createCaptureRuntimeSource calls', async () => {
    const { createCaptureRuntimeSource } = await import('../capture-runtime-source.helpers');

    expect(createCaptureRuntimeSource()).toBe(createCaptureRuntimeSource());
  });

  it('stops forwarding events to a listener once it unsubscribes', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const { createCaptureRuntimeSource } = await import('../capture-runtime-source.helpers');
    const source = createCaptureRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribeCaptureTransactions(listener);

    await vi.advanceTimersByTimeAsync(5000);

    unsubscribe();
    handlers.get('capture.transaction')?.({ requestId: 'req-1' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/capture-runtime-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const helperPath = join(sourceRoot, 'capture-runtime-source.helpers.ts');
    const sourceText = readFileSync(indexPath, 'utf8');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(true);
    expect(sourceText).toContain("from './capture-runtime-source.types'");
    expect(sourceText).toContain("from './capture-runtime-source.helpers'");
    expect(sourceText).not.toMatch(/export interface\s+CaptureRuntimeSource\b/);
    expect(sourceText).not.toMatch(/export function\s+/);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
