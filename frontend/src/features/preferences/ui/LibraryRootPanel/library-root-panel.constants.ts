import { settingsKeys } from '../../../../shared/query/query-keys/query-keys.constants';

/** Field label for the library root input. */
export const LIBRARY_ROOT_LABEL = 'Library root';

/** Helper copy explaining how the root is used. */
export const LIBRARY_ROOT_DESCRIPTION =
  'The one folder on this computer where your anime library lives. New animes default to this folder plus their name; you can still pick another folder per anime in Intake and the editor. Changing it offers to move your active animes to the new root.';

/** Native folder-picker dialog title. */
export const LIBRARY_ROOT_PICKER_TITLE = 'Choose library root folder';

/** Toast message shown after the root is persisted. */
export const LIBRARY_ROOT_SAVED_MESSAGE = 'Library root saved';

/** Fallback error copy when persisting the root fails unexpectedly. */
export const LIBRARY_ROOT_ERROR_MESSAGE = 'Could not save the library root.';

/** Heading of the root change confirmation. */
export const LIBRARY_ROOT_CHANGE_TITLE = 'Change library root?';

/** Group label for the active animes whose saved folder follows the root. */
export const LIBRARY_ROOT_CHANGE_MOVES_LABEL = 'Will be updated';

/** Group label for the active animes outside the old root. */
export const LIBRARY_ROOT_CHANGE_KEPT_LABEL = 'Left unchanged';

/** Warning that files on disk are never moved. */
export const LIBRARY_ROOT_CHANGE_DISK_WARNING = 'Bridge only updates the saved paths. Move the folders on disk yourself.';

/** Query key of the stored library root, served by the `settings` module. */
export const LIBRARY_ROOT_QUERY_KEY = settingsKeys.key('library-root');

/** Screen-reader label of the loading status region. */
export const LIBRARY_ROOT_LOADING_LABEL = 'Loading the library root';

/** Title of the Alert shown when the stored root cannot be read. */
export const LIBRARY_ROOT_UNAVAILABLE_TITLE = 'Library root unavailable';
