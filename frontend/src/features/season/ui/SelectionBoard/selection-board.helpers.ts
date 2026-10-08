import { toast } from '@heroui/react';
import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import {
  CONSIDERATION_INSUFFICIENT_QUOTA,
  CONSIDERATION_NONE,
  CONSIDERATION_OPTIONS,
  CONSIDERATION_SPARE_QUOTA,
  CONSIDERATION_TEMPORARILY_APPROVED,
  SELECTION_GROUP_VERDICTS,
} from './selection-board.constants';
import type { QuotaColor, QuotaStatus, SelectionGroup, SelectionRow, Verdict } from './selection-board.types';

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

/** getQuotaColor maps the quota meter state to its chip color: over is danger, at is warning, under is success. */
export function getQuotaColor(quota: QuotaStatus): QuotaColor {
  if (quota === 'over') {
    return 'danger';
  }
  return quota === 'at' ? 'warning' : 'success';
}

/** formatSelectionGrade shows a candidate's first-episode grade, or a dash while it is ungraded (below 1). */
export function formatSelectionGrade(grade: number): string {
  return grade >= 1 ? String(grade) : '—';
}

/**
 * groupSelectionRows splits the candidate rows into an Approved group then a
 * Rejected group, each keeping the rows' own order. A group with no rows is
 * left out, so the list never shows an empty heading.
 */
export function groupSelectionRows(rows: readonly SelectionRow[]): SelectionGroup[] {
  return SELECTION_GROUP_VERDICTS.map((verdict) => ({
    verdict,
    label: getVerdictLabel(verdict),
    rows: rows.filter((row) => row.verdict === verdict),
  })).filter((group) => group.rows.length > 0);
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

/**
 * toConsiderationToken reads the consideration Select's new value as the token
 * to store, falling back to "none" when the Select reports no selection.
 */
export function toConsiderationToken(value: string | number | null): string {
  return value?.toString() ?? CONSIDERATION_NONE;
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
