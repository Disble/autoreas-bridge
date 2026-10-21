import { describe, expect, it } from 'vitest';
import { describeActivityChange } from '../change-words.helpers';
import type { ActivityChangeWordsInput } from '../change-words.types';

/** Builds a change to word: an episode adjustment from the phone by default. */
function change(overrides: Partial<ActivityChangeWordsInput>): ActivityChangeWordsInput {
  return {
    source: 'mobile',
    actionType: 'episode_adjusted',
    beforeJson: '{"NroCapVisto":10}',
    afterJson: '{"NroCapVisto":11}',
    ...overrides,
  };
}

describe('describeActivityChange', () => {
  it('words an episode adjustment from the phone', () => {
    expect(describeActivityChange(change({}))).toBe('episode 10 → 11 · from the phone');
  });

  it('words a state change with the stored state labels', () => {
    expect(
      describeActivityChange(change({ source: 'desktop', actionType: 'anime_state_set', beforeJson: '{"Estado":0}', afterJson: '{"Estado":1}' })),
    ).toBe('state Viendo → Finalizado · from the bridge');
  });

  it('words a season grade change, and a first grade without a before', () => {
    expect(describeActivityChange(change({ actionType: 'season_grade_set', beforeJson: '{"grade":4}', afterJson: '{"grade":5}' }))).toBe(
      'grade 4 → 5 · from the phone',
    );
    expect(describeActivityChange(change({ source: 'desktop', actionType: 'season_grade_set', beforeJson: '{}', afterJson: '{"grade":3}' }))).toBe(
      'grade 3 · from the bridge',
    );
    expect(describeActivityChange(change({ actionType: 'season_grade_set', beforeJson: '', afterJson: '{}' }))).toBe('grade changed · from the phone');
  });

  it.each([
    ['anime_soft_deleted', 'removed'],
    ['anime_restored', 'restored'],
    ['anime_repeated', 'watching again'],
    ['cover_refreshed', 'cover refreshed'],
  ])('words %s as %s', (actionType, expected) => {
    expect(describeActivityChange(change({ source: 'system', actionType }))).toBe(`${expected} · by the bridge`);
  });

  it('falls back to the action words when a snapshot cannot be read', () => {
    expect(describeActivityChange(change({ beforeJson: '', afterJson: 'not json' }))).toBe('episode adjusted · from the phone');
    expect(describeActivityChange(change({ beforeJson: '[]', afterJson: '{"NroCapVisto":2}' }))).toBe('episode adjusted · from the phone');
    expect(describeActivityChange(change({ actionType: 'anime_state_set', beforeJson: '{}', afterJson: '{"Estado":1}' }))).toBe('anime state set · from the phone');
    expect(describeActivityChange(change({ beforeJson: '{"NroCapVisto":3}', afterJson: '{}' }))).toBe('episode adjusted · from the phone');
    expect(describeActivityChange(change({ beforeJson: 'null', afterJson: '5' }))).toBe('episode adjusted · from the phone');
  });

  it('reads the episode or state only for the action that changes it', () => {
    expect(describeActivityChange(change({ actionType: 'anime_restored', beforeJson: '{"Estado":0}', afterJson: '{"Estado":1}' }))).toBe('restored · from the phone');
    expect(describeActivityChange(change({ actionType: 'anime_repeated', beforeJson: '{"NroCapVisto":12}', afterJson: '{"NroCapVisto":0}' }))).toBe('watching again · from the phone');
  });

  it('names an unknown writer as stored', () => {
    expect(describeActivityChange(change({ source: 'legacy' }))).toBe('episode 10 → 11 · from legacy');
  });
});
