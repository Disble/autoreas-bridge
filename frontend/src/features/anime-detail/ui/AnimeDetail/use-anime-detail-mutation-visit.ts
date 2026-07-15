import { useCallback, useEffect, useRef } from 'react';
import {
  isAnimeDetailMutationVisitActive,
  nextAnimeDetailMutationRouteGeneration,
} from './anime-detail.helpers';
import type { AnimeDetailMutationVisitController } from './anime-detail.types';

/** Owns mounted-instance and route-generation identity for async mutations. */
export function useAnimeDetailMutationVisit(animeId: string): AnimeDetailMutationVisitController {
  // 1. Refs
  const activeAnimeIdRef = useRef(animeId);
  const routeGenerationRef = useRef(0);
  const mountedVisitRef = useRef(false);
  routeGenerationRef.current = nextAnimeDetailMutationRouteGeneration(
    activeAnimeIdRef.current,
    routeGenerationRef.current,
    animeId,
  );
  activeAnimeIdRef.current = animeId;

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const isActive = useCallback((
    actionAnimeId: string,
    actionRouteGeneration: number,
  ): boolean => isAnimeDetailMutationVisitActive(
    mountedVisitRef.current,
    activeAnimeIdRef.current,
    routeGenerationRef.current,
    actionAnimeId,
    actionRouteGeneration,
  ), []);

  // 7. Effects
  useEffect(() => {
    mountedVisitRef.current = true;

    return () => {
      mountedVisitRef.current = false;
    };
  }, []);

  return {
    routeGeneration: routeGenerationRef.current,
    isActive,
  };
}
