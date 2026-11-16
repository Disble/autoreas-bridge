import { settingsKeys } from '../../../../shared/query/query-keys/query-keys.constants';

/** Message shown when the Windows auto-start binding cannot save the preference. */
export const AUTO_START_ERROR_MESSAGE = 'Unable to update Windows auto-start.';

/** Message shown after the Windows auto-start preference is saved. */
export const AUTO_START_SAVED_MESSAGE = 'Windows auto-start preference saved.';

/** Query key of the stored login-launch preference, served by the `settings` module. */
export const AUTO_START_QUERY_KEY = settingsKeys.key('auto-start');

/** Screen-reader label of the loading status region. */
export const AUTO_START_LOADING_LABEL = 'Loading the Windows auto-start preference';

/** Title of the Alert shown when the stored preference cannot be read. */
export const AUTO_START_UNAVAILABLE_TITLE = 'Windows auto-start unavailable';
