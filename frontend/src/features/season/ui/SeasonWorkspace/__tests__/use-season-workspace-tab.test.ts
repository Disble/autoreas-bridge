import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Key } from 'react';
import { SEASON_SECTION_TABS } from '../season-workspace.constants';
import type { SeasonSectionId } from '../season-workspace.types';
import { useSeasonWorkspaceTab } from '../use-season-workspace-tab';

describe('useSeasonWorkspaceTab', () => {
  it.each([
    ['evaluation', 'evaluation'],
    ['not-a-tab', 'overview'],
  ] as const)('selecting %s leaves the active tab at %s', (key, expected) => {
    const { result } = renderHook(() => useSeasonWorkspaceTab());

    expect(result.current.activeTab).toBe('overview');
    act(() => result.current.selectTab(key as Key));
    expect(result.current.activeTab).toBe(expected satisfies SeasonSectionId);
    expect(SEASON_SECTION_TABS.some((tab) => tab.id === result.current.activeTab)).toBe(true);
  });
});
