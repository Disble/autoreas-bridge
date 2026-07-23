import { toast } from '@heroui/react';
import type { SeasonAnimeRow } from '../../../../infrastructure/season-source';
import {
  CONSIDERATION_INSUFFICIENT_QUOTA,
  CONSIDERATION_OPTIONS,
  CONSIDERATION_SPARE_QUOTA,
  CONSIDERATION_TEMPORARILY_APPROVED,
} from './selection-board.constants';
import type { QuotaStatus, SelectionRow, Verdict } from './selection-board.types';

/**
 * decideVerdict is the drift-proof twin of the Go domain `Decision` (the 10-year
 * Excel formula): approves when the grade meets the cutoff and quota is not
 * withheld, or when a rescue consideration applies; rejects otherwise. The Go
 * golden suite and this one share one table of cases.
 */
export function decideVerdict(grade: number, minApprovalGrade: number, consideration: string): Verdict {
  if (grade >= minApprovalGrade && consideration !== CONSIDERATION_INSUFFICIENT_QUOTA) {
    return 'approved';
  }
  if (consideration === CONSIDERATION_TEMPORARILY_APPROVED || consideration === CONSIDERATION_SPARE_QUOTA) {
    return 'approved';
  }
  return 'rejected';
}

/**
 * toSelectionRows narrows the season rows to created candidates, derives each
 * verdict, and groups approved rows first (rejected after), preserving order
 * within each group — the "Aprobado-first with a divider" table layout.
 */
export function toSelectionRows(rows: readonly SeasonAnimeRow[], minApprovalGrade: number): SelectionRow[] {
  const approved: SelectionRow[] = [];
  const rejected: SelectionRow[] = [];
  for (const r of rows) {
    if (r.availability !== 'created' || r.animeId === '') {
      continue;
    }
    const verdict = decideVerdict(r.grade, minApprovalGrade, r.consideration);
    const selectionRow: SelectionRow = {
      id: r.id,
      animeId: r.animeId,
      rawName: r.rawName,
      grade: r.grade,
      consideration: r.consideration,
      verdict,
      folderPath: r.folderPath ?? '',
      pageUrl: r.pageUrl ?? '',
      hasFolder: (r.folderPath ?? '') !== '',
      hasPage: (r.pageUrl ?? '') !== '',
    };
    (verdict === 'approved' ? approved : rejected).push(selectionRow);
  }
  return [...approved, ...rejected];
}

/** countApproved returns how many created candidates derive as approved. */
export function countApproved(rows: readonly SeasonAnimeRow[], minApprovalGrade: number): number {
  let n = 0;
  for (const r of rows) {
    if (r.availability === 'created' && r.animeId !== '' && decideVerdict(r.grade, minApprovalGrade, r.consideration) === 'approved') {
      n += 1;
    }
  }
  return n;
}

/** quotaStatus classifies the approved count against the slot cap. */
export function quotaStatus(approved: number, slots: number): QuotaStatus {
  if (approved > slots) {
    return 'over';
  }
  return approved === slots ? 'at' : 'under';
}

/** formatConfirmSuccess builds the success toast copy for an applied reconciliation. */
export function formatConfirmSuccess(approved: number, rejected: number): string {
  return `Reconciliation applied — ${approved} approved, ${rejected} rejected.`;
}

/**
 * formatSelectionConfirmedLabel builds the persistent header label showing whether
 * the current selection has ever been confirmed, and when. `undefined`/`0` means the
 * milestone was never stamped for this season.
 */
export function formatSelectionConfirmedLabel(confirmedAtMs?: number): string {
  if (confirmedAtMs === undefined || confirmedAtMs === 0) {
    return 'Not confirmed yet';
  }
  return `Confirmed ${new Date(confirmedAtMs).toLocaleString()}`;
}

/** getVerdictLabel maps a verdict token to its English display label. */
export function getVerdictLabel(verdict: Verdict): string {
  return verdict === 'approved' ? 'Approved' : 'Rejected';
}

/** getConsiderationLabel maps a consideration token to its English display label. */
export function getConsiderationLabel(token: string): string {
  return CONSIDERATION_OPTIONS.find((o) => o.value === token)?.label ?? token;
}

/**
 * Runs a bridgeRuntimeSource desktop-action command (open/copy page or
 * folder), surfacing a success toast only for copy actions. Mirrors the
 * Episodes card's `runDesktopAction` pattern. No-ops when the binding is
 * absent (non-Wails/browser context), keeping the caller type-safe.
 */
export async function runDesktopAction(
  action: ((animeID: string) => Promise<{ readonly status: string }>) | undefined,
  animeID: string,
  successToast?: string,
): Promise<void> {
  if (action === undefined) {
    return;
  }
  const result = await action(animeID);
  if (result.status !== 'ok') {
    return;
  }
  if (successToast !== undefined) {
    toast.success(successToast);
  }
}
