/** Prefix of the trigger label, followed by the saved time: "Daily check 21:00". */
export const CHECK_TIME_TRIGGER_PREFIX = 'Daily check';

/** Heading of the popover, also the time field's label. */
export const CHECK_TIME_HEADING = 'Daily availability check';

/** The muted line under the field explaining when the check runs. */
export const CHECK_TIME_HINT = 'Runs every day while a season is open.';

/** Shown when Save is pressed while the field holds no complete time. */
export const CHECK_TIME_EMPTY_MESSAGE = 'Enter a time.';

/** A zero-padded 24-hour HH:MM, the only shape the backend stores. */
export const CHECK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Fallback when a save rejects without any text. */
export const CHECK_TIME_SAVE_FAILED_MESSAGE = 'Could not save the check time.';

/** Screen-reader label of the control's loading skeleton. */
export const CHECK_TIME_LOADING_LABEL = 'Loading the daily check time';

/** DOM id tying the loading skeleton to its screen-reader label. */
export const CHECK_TIME_LOADING_LABEL_ID = 'intake-check-time-loading-label';

/** Title of the control's failure state, above the bridge's message. */
export const CHECK_TIME_LOAD_FAILED_TITLE = 'Daily check time unavailable';
