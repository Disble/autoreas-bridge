import type { NetworkRequestRow } from '../../../../shared/store/network-store.types';
import { NETWORK_DURATION_EMPTY_LABEL, NETWORK_PENDING_LABEL } from './network-panel.constants';
import type { HeroChipColor, NetworkRowStatusTone, NetworkRowViewModel } from './network-panel.types';

/**
 * Resolves the display name for a Network row: the request path, falling
 * back to the row's domain when path is empty (non-HTTP rows have no path).
 */
export function getNetworkRowName(row: NetworkRequestRow): string {
  if (row.path !== '') {
    return row.path;
  }

  return row.domain;
}

/**
 * Maps a numeric HTTP status to a semantic visual tone: success (2xx/3xx),
 * warning (4xx), danger (5xx), or pending when the status has not arrived yet.
 */
export function getNetworkStatusTone(status: number | null): NetworkRowStatusTone {
  if (status === null) {
    return 'pending';
  }

  if (status >= 200 && status < 400) {
    return 'success';
  }

  if (status >= 400 && status < 500) {
    return 'warning';
  }

  return 'danger';
}

/**
 * Formats the status label for display: the numeric status as a string, or
 * the Null Object "pending" label while the row has no status yet.
 */
export function getNetworkStatusLabel(status: number | null): string {
  if (status === null) {
    return NETWORK_PENDING_LABEL;
  }

  return String(status);
}

/**
 * Formats a duration in milliseconds for display, or the Null Object em-dash
 * label when no duration has been recorded yet.
 */
export function formatNetworkDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return NETWORK_DURATION_EMPTY_LABEL;
  }

  return `${durationMs}ms`;
}

/**
 * Maps a row status tone to the project's HeroUI Chip color token, so the
 * dumb table/detail components never branch on tone-to-color logic directly.
 */
export function toHeroChipColor(tone: NetworkRowStatusTone): HeroChipColor {
  if (tone === 'pending') {
    return 'default';
  }

  return tone;
}

/**
 * Maps a `NetworkRequestRow` from the store fold into a presentation-ready
 * view-model consumed by the dumb `NetworkTable` row renderer.
 */
export function toNetworkRowViewModel(row: NetworkRequestRow): NetworkRowViewModel {
  return {
    id: row.correlationId,
    name: getNetworkRowName(row),
    method: row.method,
    statusLabel: getNetworkStatusLabel(row.status),
    statusTone: getNetworkStatusTone(row.status),
    type: row.domain,
    durationLabel: formatNetworkDuration(row.durationMs),
  };
}
