/** Shared long-date formatter hoisted once for day headings (e.g. "September 12, 2026"). */
export const DAY_HEADING_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** Shared date-half formatter for episode rows (e.g. "Fri, Sep 11"); the time half reuses the zero-padded `HH:MM` convention. */
export const ROW_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
