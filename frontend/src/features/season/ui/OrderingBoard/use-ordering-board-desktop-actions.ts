import { useCallback } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { runDesktopAction } from '../SelectionBoard/selection-board.helpers';
import type { OrderingBoardDesktopActions } from './ordering-board.types';

/**
 * Exposes the anime page and folder desktop actions the ordering cards offer. Each
 * action delegates to `runDesktopAction`, which no-ops outside the Wails shell and
 * toasts only the copy actions.
 * @returns Stable open/copy callbacks for an anime's page and download folder.
 */
export function useOrderingBoardDesktopActions(): OrderingBoardDesktopActions {
  // 6. Callbacks
  // Stryker disable ArrayDeclaration: these deps arrays are mutation-equivalent whether they are `[]`
  // or a fixed literal such as `["Stryker was here"]`: each callback closes over only its own
  // argument plus the module-level `bridgeRuntimeSource` method read at call time, and either
  // array is a constant of equal length on every render, so React never observes a dependency
  // change and callback identity is identical under both.
  const onOpenPage = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.openAnimePage, animeId), []);
  const onCopyPage = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.copyAnimePage, animeId, 'Page URL copied to clipboard'), []);
  const onOpenFolder = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.openAnimeFolder, animeId), []);
  const onCopyFolder = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.copyAnimeFolder, animeId, 'Folder path copied to clipboard'), []);
  // Stryker restore ArrayDeclaration

  return { onOpenPage, onCopyPage, onOpenFolder, onCopyFolder };
}
