import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActivityFeedLine } from '../../feed-source/feed.types';
import { useDrawerPresence } from '../use-drawer-presence';
import { feedLine } from './drawer.fixtures';

/** A line of the feed. */
const A = feedLine({}, { id: 'a' });

describe('useDrawerPresence', () => {
  it('holds the line after close until the panel has slid out, then a reopen is a new session', () => {
    const { result, rerender } = renderHook(({ line }: { readonly line: ActivityFeedLine | undefined }) => useDrawerPresence(line), { initialProps: { line: undefined as ActivityFeedLine | undefined } });
    expect(result.current.line).toBeUndefined();

    rerender({ line: A });
    expect(result.current).toMatchObject({ line: A, open: true, session: 1 });

    rerender({ line: undefined });
    expect(result.current).toMatchObject({ line: A, open: false });

    const panel = {};
    act(() => result.current.onTransitionEnd({ propertyName: 'width', target: panel, currentTarget: panel }));
    expect(result.current.line).toBe(A);
    act(() => result.current.onTransitionEnd({ propertyName: 'translate', target: panel, currentTarget: panel }));
    expect(result.current.line).toBeUndefined();

    rerender({ line: A });
    expect(result.current).toMatchObject({ line: A, open: true, session: 2 });
  });
});
