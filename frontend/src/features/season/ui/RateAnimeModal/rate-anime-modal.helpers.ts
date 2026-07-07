/**
 * getGradeSourceNote returns a short human note describing how the current grade
 * was captured, or an empty string when the anime is ungraded. Shown under the
 * grade picker so the user knows when a mobile-synced grade is being overridden.
 */
export function getGradeSourceNote(gradeSource: string): string {
  if (gradeSource === 'mobile_sync') {
    return 'Synced from mobile';
  }
  if (gradeSource === 'manual') {
    return 'Set on desktop';
  }
  return '';
}

/**
 * formatGradeLabel renders a grade for display: the number when graded (1–6), or
 * "No grade" when ungraded (0).
 */
export function formatGradeLabel(grade: number): string {
  return grade >= 1 ? String(grade) : 'No grade';
}
