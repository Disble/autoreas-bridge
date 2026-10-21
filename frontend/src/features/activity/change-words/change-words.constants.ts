/** Plain words per write action; an unknown action falls back to its own words. */
export const ACTIVITY_CHANGE_ACTION_WORDS: Readonly<Record<string, string>> = {
  anime_soft_deleted: 'removed',
  anime_restored: 'restored',
  anime_repeated: 'watching again',
  season_grade_set: 'grade changed',
};

/** Plain words per writer; an unknown writer is named as stored. */
export const ACTIVITY_CHANGE_SOURCE_WORDS: Readonly<Record<string, string>> = {
  mobile: 'from the phone',
  desktop: 'from the bridge',
  system: 'by the bridge',
};
