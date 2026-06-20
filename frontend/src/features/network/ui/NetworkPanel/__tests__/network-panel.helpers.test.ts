import { describe, expect, it } from 'vitest';
import type { NetworkRequestRow } from '../../../../../shared/store/network-store.types';
import {
  formatNetworkDuration,
  getNetworkRowName,
  getNetworkStatusLabel,
  getNetworkStatusTone,
  toHeroChipColor,
  toNetworkRowViewModel,
} from '../network-panel.helpers';

function row(overrides: Partial<NetworkRequestRow> = {}): NetworkRequestRow {
  return {
    correlationId: 'row-1',
    method: 'GET',
    path: '/sync',
    status: 200,
    durationMs: 42,
    domain: 'api',
    startedAt: '2026-06-20T00:00:00Z',
    updatedAt: '2026-06-20T00:00:01Z',
    events: [],
    ...overrides,
  };
}

describe('getNetworkRowName', () => {
  it('returns the path when present', () => {
    expect(getNetworkRowName(row({ path: '/sync' }))).toBe('/sync');
  });

  it('falls back to domain when path is empty (non-HTTP rows)', () => {
    expect(getNetworkRowName(row({ path: '', domain: 'sync' }))).toBe('sync');
  });
});

describe('getNetworkStatusTone', () => {
  it('returns success for 2xx', () => {
    expect(getNetworkStatusTone(200)).toBe('success');
  });

  it('returns success for 3xx', () => {
    expect(getNetworkStatusTone(304)).toBe('success');
  });

  it('returns warning for 4xx', () => {
    expect(getNetworkStatusTone(404)).toBe('warning');
  });

  it('returns danger for 5xx', () => {
    expect(getNetworkStatusTone(500)).toBe('danger');
  });

  it('returns pending for null status', () => {
    expect(getNetworkStatusTone(null)).toBe('pending');
  });
});

describe('getNetworkStatusLabel', () => {
  it('returns the numeric status as a string', () => {
    expect(getNetworkStatusLabel(200)).toBe('200');
  });

  it('returns "pending" for null status', () => {
    expect(getNetworkStatusLabel(null)).toBe('pending');
  });
});

describe('formatNetworkDuration', () => {
  it('formats a millisecond duration', () => {
    expect(formatNetworkDuration(42)).toBe('42ms');
  });

  it('returns an em dash for null duration', () => {
    expect(formatNetworkDuration(null)).toBe('—');
  });
});

describe('toHeroChipColor', () => {
  it('maps success to success', () => {
    expect(toHeroChipColor('success')).toBe('success');
  });

  it('maps warning to warning', () => {
    expect(toHeroChipColor('warning')).toBe('warning');
  });

  it('maps danger to danger', () => {
    expect(toHeroChipColor('danger')).toBe('danger');
  });

  it('maps pending to default', () => {
    expect(toHeroChipColor('pending')).toBe('default');
  });
});

describe('toNetworkRowViewModel', () => {
  it('maps a complete row to its view-model', () => {
    const viewModel = toNetworkRowViewModel(
      row({ correlationId: 'row-1', path: '/sync', status: 200, durationMs: 42, domain: 'api' }),
    );

    expect(viewModel).toEqual({
      id: 'row-1',
      name: '/sync',
      method: 'GET',
      statusLabel: '200',
      statusTone: 'success',
      type: 'api',
      durationLabel: '42ms',
    });
  });

  it('maps a pending row (null status, null duration) to its Null Object labels', () => {
    const viewModel = toNetworkRowViewModel(row({ status: null, durationMs: null }));

    expect(viewModel.statusLabel).toBe('pending');
    expect(viewModel.statusTone).toBe('pending');
    expect(viewModel.durationLabel).toBe('—');
  });
});
