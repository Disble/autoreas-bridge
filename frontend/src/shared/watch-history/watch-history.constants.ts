/** Shared long-date formatter hoisted once for day headings (e.g. "September 12, 2026"). */
export const DAY_HEADING_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
