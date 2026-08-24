import { describe, expect, it } from 'vitest';
import type { NotificationAction, NotificationDetailRow } from '../../../../../shared/contracts/notification-center.types';
import {
  formatLevelLabel,
  isCollapsedRow,
  resolveLevelChipColor,
  resolveRefusalMessage,
  resolveRowActions,
  resolveServerActionStatus,
} from '../notification-detail.helpers';

/** Minimal row fixture builder so each test only states the fields it cares about. */
function buildRow(overrides: Partial<NotificationDetailRow> = {}): NotificationDetailRow {
  return { detail: 'Episode 3 failed', name: 'Some Anime', refId: 'anime-1', refType: 'anime', status: 'Stopped', ...overrides };
}

/** Minimal action fixture builder, mirroring `buildRow` above. */
function buildAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return { id: 'action-1', intent: 'download.run_anime', label: 'Run this anime again', ...overrides };
}

describe('isCollapsedRow', () => {
  it('is false for a row with no collapsedCount', () => {
    expect(isCollapsedRow(buildRow())).toBe(false);
  });

  it('is false for a row with collapsedCount of exactly 0', () => {
    expect(isCollapsedRow(buildRow({ collapsedCount: 0 }))).toBe(false);
  });

  it('is true for a row carrying a positive collapsedCount', () => {
    expect(isCollapsedRow(buildRow({ collapsedCount: 7 }))).toBe(true);
  });
});

describe('resolveRowActions', () => {
  it('returns an empty list when the row carries no actionIds', () => {
    expect(resolveRowActions(buildRow({ actionIds: undefined }), [buildAction()])).toStrictEqual([]);
  });

  it('resolves the row actionIds against the full actions list, in actionIds order', () => {
    const first = buildAction({ id: 'a', label: 'First' });
    const second = buildAction({ id: 'b', label: 'Second' });
    const row = buildRow({ actionIds: ['b', 'a'] });

    expect(resolveRowActions(row, [first, second])).toStrictEqual([second, first]);
  });

  it('drops a stale actionId absent from the full actions list rather than rendering a broken button', () => {
    const known = buildAction({ id: 'known' });
    const row = buildRow({ actionIds: ['known', 'gone'] });

    expect(resolveRowActions(row, [known])).toStrictEqual([known]);
  });
});

describe('resolveLevelChipColor', () => {
  it.each([
    ['info', 'accent'],
    ['success', 'success'],
    ['warning', 'warning'],
    ['error', 'danger'],
  ] as const)('maps level %s to chip color %s', (level, expectedColor) => {
    expect(resolveLevelChipColor(level)).toBe(expectedColor);
  });

  it('falls back to the info color for an unrecognized level', () => {
    expect(resolveLevelChipColor('mystery')).toBe('accent');
  });
});

describe('formatLevelLabel', () => {
  it('capitalizes the first letter of a level string', () => {
    expect(formatLevelLabel('warning')).toBe('Warning');
  });

  it('returns an empty string unchanged', () => {
    expect(formatLevelLabel('')).toBe('');
  });
});

describe('resolveServerActionStatus', () => {
  it('is idle for an action with neither executedAtMs nor refusedReason', () => {
    expect(resolveServerActionStatus(buildAction())).toBe('idle');
  });

  it('is executed once executedAtMs is a positive timestamp', () => {
    expect(resolveServerActionStatus(buildAction({ executedAtMs: 1_700_000_000_000 }))).toBe('executed');
  });

  it('is refused once refusedReason is a non-empty string', () => {
    expect(resolveServerActionStatus(buildAction({ refusedReason: 'intent_unregistered' }))).toBe('refused');
  });

  it('prefers executed over refused when both are somehow set, since executedAtMs is stamped only on real success', () => {
    expect(resolveServerActionStatus(buildAction({ executedAtMs: 1, refusedReason: 'target_missing' }))).toBe('executed');
  });

  it("stays idle when executedAtMs is exactly 0, the wire's \"never executed\" sentinel", () => {
    expect(resolveServerActionStatus(buildAction({ executedAtMs: 0 }))).toBe('idle');
  });

  it("stays idle when refusedReason is an empty string, the wire's \"not refused\" sentinel", () => {
    expect(resolveServerActionStatus(buildAction({ refusedReason: '' }))).toBe('idle');
  });
});

describe('resolveRefusalMessage', () => {
  it('returns undefined for an undefined reason', () => {
    expect(resolveRefusalMessage(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty-string reason', () => {
    expect(resolveRefusalMessage('')).toBeUndefined();
  });

  it.each([
    ['intent_unregistered', 'This action is not available yet.'],
    ['target_missing', 'The thing this action pointed at is gone.'],
    ['already_executed', 'This action already ran.'],
    ['foreign_action', "This action doesn't belong to this notification."],
  ])('maps the closed reason %s to its inline message', (reason, expectedMessage) => {
    expect(resolveRefusalMessage(reason)).toBe(expectedMessage);
  });

  it('falls back to a generic message for a reason outside the closed set', () => {
    expect(resolveRefusalMessage('unheard_of_reason')).toBe('This action was refused.');
  });
});
