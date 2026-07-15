import { describe, expect, it } from 'vitest';
import {
  isAnimeDetailMutationVisitActive,
  nextAnimeDetailMutationRouteGeneration,
  resolveAnimeDetailMutation,
  toAnimeDetailConfirmation,
  withAnimeDetailRefreshFailure,
} from '../anime-detail.helpers';

describe('isAnimeDetailMutationVisitActive', () => {
  it('accepts a mounted visit with the same anime and route generation', () => {
    expect(isAnimeDetailMutationVisitActive(true, 'anime-1', 3, 'anime-1', 3)).toBe(true);
  });

  it.each([
    [false, 'anime-1', 3],
    [true, 'anime-2', 3],
    [true, 'anime-1', 4],
  ] as const)(
    'rejects mounted=%s route scope for %s generation %i',
    (isMounted, activeAnimeId, activeGeneration) => {
      expect(isAnimeDetailMutationVisitActive(
        isMounted,
        activeAnimeId,
        activeGeneration,
        'anime-1',
        3,
      )).toBe(false);
    },
  );
});

describe('nextAnimeDetailMutationRouteGeneration', () => {
  it('keeps the generation for another render of the same route', () => {
    expect(nextAnimeDetailMutationRouteGeneration('anime-1', 3, 'anime-1')).toBe(3);
  });

  it('advances the generation when the route changes', () => {
    expect(nextAnimeDetailMutationRouteGeneration('anime-1', 3, 'anime-2')).toBe(4);
  });
});

describe('toAnimeDetailConfirmation', () => {
  it.each([
    ['repeat', 'Repeat Frieren?', 'This starts a new watch cycle.', 'Confirm Repeat'],
    ['restore', 'Restore Frieren?', 'This makes the anime active again.', 'Confirm Restore'],
  ] as const)('builds explicit English confirmation copy for %s', (action, heading, description, confirmLabel) => {
    expect(toAnimeDetailConfirmation(action, 'Frieren')).toEqual({
      action,
      heading,
      description,
      confirmLabel,
    });
  });
});

describe('resolveAnimeDetailMutation', () => {
  it.each([
    ['applied', 'success', 'Repeat applied', 'Repeat was applied. Current version: 0.'],
    ['no_op', 'accent', 'Repeat not needed', 'No changes were needed. Current version: 0.'],
  ] as const)('maps %s to accurate feedback and a detail refetch', (outcome, status, title, description) => {
    expect(resolveAnimeDetailMutation('repeat', { status: 'ok', outcome, modifiedAt: 0 } as never)).toEqual({
      feedback: { status, title, description },
      shouldRefetch: true,
    });
  });

  it('reports conflict authority and identity without claiming success', () => {
    expect(resolveAnimeDetailMutation('restore', {
      status: 'ok',
      outcome: 'conflict',
      modifiedAt: 42,
      conflictId: 'conflict-7',
    } as never)).toEqual({
      feedback: {
        status: 'warning',
        title: 'Restore not applied',
        description: 'The anime changed before Restore could be applied. Current version: 42. Conflict: conflict-7.',
      },
      shouldRefetch: true,
    });
  });

  it('fails closed for a transport error and never requests a success refetch', () => {
    expect(resolveAnimeDetailMutation('repeat', {
      status: 'error',
      message: 'anime not found',
      modifiedAt: 0,
    } as never)).toEqual({
      feedback: {
        status: 'danger',
        title: 'Repeat failed',
        description: 'anime not found',
      },
      shouldRefetch: false,
    });
  });

  it('fails closed for an unknown outcome', () => {
    const resolution = resolveAnimeDetailMutation('restore', {
      status: 'ok',
      outcome: 'mystery',
      modifiedAt: 9,
    } as never);

    expect(resolution.feedback.status).toBe('danger');
    expect(resolution.feedback.title).toBe('Restore failed');
    expect(resolution.feedback.description).toContain('unexpected result');
    expect(resolution.shouldRefetch).toBe(false);
  });
});

describe('withAnimeDetailRefreshFailure', () => {
  it('preserves the authoritative outcome while warning that Detail stayed stale', () => {
    const resolved = resolveAnimeDetailMutation('repeat', {
      status: 'ok', outcome: 'applied', modifiedAt: 11,
    } as never);

    expect(withAnimeDetailRefreshFailure(resolved)).toEqual({
      feedback: {
        status: 'warning',
        title: 'Repeat applied',
        description: 'Repeat was applied. Current version: 11. Anime Detail could not be refreshed.',
      },
      shouldRefetch: false,
    });
  });
});
