import { describe, expect, it } from 'vitest';
import type { NotificationAction, NotificationDetail, NotificationDetailRow } from '../../../../../shared/contracts/notification-center.types';
import {
  formatDetailWhenLabel,
  formatLevelLabel,
  isCollapsedRow,
  resolveLevelChipColor,
  resolveNotificationActions,
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

/** Minimal detail fixture builder for the metadata-footer cases below. */
function buildDetail(overrides: Partial<NotificationDetail> = {}): NotificationDetail {
  return {
    actionCount: 0,
    actions: [],
    body: 'Everything after the failed episode was never attempted.',
    createdAtMs: 1_700_000_000_000,
    id: 1,
    level: 'warning',
    rows: [],
    source: 'download',
    title: 'Download stopped before the season finished',
    ...overrides,
  };
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

describe('resolveNotificationActions', () => {
  it('keeps an action carrying no rowRef, which `Intents.dc.html` defines as the whole-notification level', () => {
    const wholeNotification = buildAction({ id: 'open', intent: 'navigation.open', label: 'Open Downloads' });

    expect(resolveNotificationActions([wholeNotification])).toStrictEqual([wholeNotification]);
  });

  it('drops an action bound to a row, so the footer never repeats a button the row already renders', () => {
    const rowAction = buildAction({ id: 'run', rowRef: 'anime-1' });

    expect(resolveNotificationActions([rowAction])).toStrictEqual([]);
  });

  it('treats an empty-string rowRef as no row reference at all, the wire sentinel for an omitted field', () => {
    const wholeNotification = buildAction({ id: 'open', rowRef: '' });

    expect(resolveNotificationActions([wholeNotification])).toStrictEqual([wholeNotification]);
  });

  it('preserves the order the record listed its whole-notification actions in', () => {
    const first = buildAction({ id: 'a', label: 'First' });
    const second = buildAction({ id: 'b', label: 'Second' });

    expect(resolveNotificationActions([first, buildAction({ id: 'c', rowRef: 'anime-1' }), second])).toStrictEqual([first, second]);
  });

  it('returns an empty list for a record carrying no actions at all', () => {
    expect(resolveNotificationActions([])).toStrictEqual([]);
  });
});

describe('formatDetailWhenLabel', () => {
  it('renders the absolute timestamp and the relative age together, in that order', () => {
    const createdAtMs = 1_800_000_000_000;

    expect(formatDetailWhenLabel(createdAtMs, createdAtMs + 5 * 60_000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} · 5m ago$/);
  });

  it('carries the relative half at every scale, since that is the half that says whether it still matters', () => {
    const createdAtMs = 1_800_000_000_000;

    expect(formatDetailWhenLabel(createdAtMs, createdAtMs + 3 * 60 * 60_000).endsWith('· 3h ago')).toBe(true);
  });
});

