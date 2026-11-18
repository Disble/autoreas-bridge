import { toast } from '@heroui/react';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { PickerSource } from '../../../../shared/contracts/picker.types';
import { applyRowCover, applyRowFolder, toAnimeCreatePickerErrorMessage } from './anime-create.helpers';
import type { AnimeCreateRowDraft } from './anime-create.types';

/**
 * Owns one create row's folder and cover-image pickers, split out of
 * `useAnimeCreateRows` (fallow complexity guard). Both run through the shell's
 * picker port and write the chosen path into the targeted row through the
 * same row helpers the form uses. A cancelled dialog (`''`) changes nothing;
 * a failed one leaves the row as it was and shows an error toast carrying the
 * bridge's reason.
 * @param setRows The rows' state setter.
 * @param pickerSource The native folder and image-file pickers.
 * @returns The two picker handlers, keyed by the row's draft id.
 */
export function useAnimeCreateRowPickers(
  setRows: Dispatch<SetStateAction<readonly AnimeCreateRowDraft[]>>,
  pickerSource: PickerSource,
) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  /** Shows a failed folder or cover dialog as an error toast; the row stays as it was. */
  const onPickerFailure = useCallback((error: unknown) => {
    toast.danger(toAnimeCreatePickerErrorMessage(error));
  }, []);
  const onBrowseFolder = useCallback((draftId: string) => {
    void pickerSource.pickFolder('Select anime folder').then((folder) => {
      setRows((current) => applyRowFolder(current, draftId, folder));
    }, onPickerFailure);
  }, [pickerSource, setRows, onPickerFailure]);
  const onBrowseCover = useCallback((draftId: string) => {
    void pickerSource.pickFile('Select cover image').then((path) => {
      setRows((current) => applyRowCover(current, draftId, path));
    }, onPickerFailure);
  }, [pickerSource, setRows, onPickerFailure]);

  // 7. Effects

  return { onBrowseFolder, onBrowseCover };
}
