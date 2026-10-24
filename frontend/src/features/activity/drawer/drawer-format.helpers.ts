import { DRAWER_DATE_FORMAT, DRAWER_MINUTE_MS, DRAWER_WHEN_FORMAT } from './drawer.constants';
import type { DrawerFact } from './drawer.types';

/** Zero-pads a clock part to two digits. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Formats epoch milliseconds as the local hour and minute.
 *
 * @param ms Epoch milliseconds.
 * @returns `14:35`.
 */
export function formatDrawerTime(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Formats epoch milliseconds as the local time to the second.
 *
 * @param ms Epoch milliseconds.
 * @returns `14:35:07`.
 */
export function formatDrawerSeconds(ms: number): string {
  return `${formatDrawerTime(ms)}:${pad(new Date(ms).getSeconds())}`;
}

/**
 * Formats epoch milliseconds as the drawer header's full date and time.
 *
 * @param ms Epoch milliseconds.
 * @returns `Thu, Oct 22 · 14:35`.
 */
export function formatDrawerWhen(ms: number): string {
  return `${DRAWER_WHEN_FORMAT.format(ms)} · ${formatDrawerTime(ms)}`;
}

/**
 * Words a span of time in whole minutes.
 *
 * @param ms Span in milliseconds.
 * @returns `45 min` or `6 h 31 min`.
 */
export function formatDrawerSpan(ms: number): string {
  const minutes = Math.round(ms / DRAWER_MINUTE_MS);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * Words the stored expiry of a ledger fact.
 *
 * @param expiresAtMs `ExpiresAtMS` as stored.
 * @returns `These details are kept until Jan 20.`
 */
export function formatDrawerKeptUntil(expiresAtMs: number): string {
  return `These details are kept until ${DRAWER_DATE_FORMAT.format(expiresAtMs)}.`;
}

/**
 * Builds one facts row.
 *
 * @param key Stable key.
 * @param label The label.
 * @param value The value.
 * @param options Monospace, an amber chip and a muted note.
 * @returns The row.
 */
export function drawerFact(key: string, label: string, value: string, options: { readonly mono?: boolean; readonly warnChip?: string; readonly note?: string } = {}): DrawerFact {
  return { key, label, value, mono: options.mono ?? false, warnChip: options.warnChip, note: options.note };
}
