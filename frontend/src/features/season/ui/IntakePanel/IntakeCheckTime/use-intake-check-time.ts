import { toast } from '@heroui/react';
import { Time } from '@internationalized/date';
import { useCallback, useState } from 'react';
import { toAsyncView } from '../../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_SETTINGS_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SETTINGS_SEASON_CHECK_TIME_KEY } from '../../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../../shared/query/use-bridge-query/use-bridge-query';
import { toCheckTimeSaveError, toCheckTimeSaveRequest, toCheckTimeValue } from './intake-check-time.helpers';
import type { CheckTimeDraft, CheckTimePort } from './intake-check-time.types';

/**
 * Drives the intake card's daily availability check time: reads the saved time
 * through the `settings` module (loading while it starts, a failure once it
 * failed or the read rejected), opens a popover seeded with it, and saves an
 * edited time, closing and re-reading on success. A rejected save keeps the
 * popover open and shows the bridge's message in a danger toast; an incomplete
 * field is refused under the field without a backend call.
 * @param source The check time port.
 * @returns The read's view, the popover state and its handlers.
 */
export function useIntakeCheckTime(source: CheckTimePort = BRIDGE_SETTINGS_SOURCE) {
  // 2. State
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<CheckTimeDraft>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: SETTINGS_SEASON_CHECK_TIME_KEY,
    queryFn: () => source.getSeasonCheckTime(),
    module: 'settings',
  });
  const { refetch } = query;
  const save = useBridgeMutation({
    mutationFn: (time: string) => source.setSeasonCheckTime(time),
    onSuccess: async () => {
      setIsOpen(false);
      await refetch();
    },
    onError: (error) => toast.danger(toCheckTimeSaveError(error)),
  });
  const { mutate: saveTime } = save;

  // 5. Derived State
  const view = toAsyncView(query);
  const checkTime = view.kind === 'ready' ? view.data : '';

  // 6. Callbacks
  const onOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      // Stryker disable next-line ConditionalExpression: resetting on close too is unobservable, the closed popover renders neither draft nor error and the next open resets both.
      if (open) {
        setDraft(toCheckTimeValue(checkTime));
        setErrorMessage(undefined);
      }
    },
    [checkTime],
  );

  const onDraftChange = useCallback(
    (value: Pick<Time, 'hour' | 'minute'> | null) => {
      setDraft(value === null ? null : new Time(value.hour, value.minute));
    },
    // Stryker disable next-line ArrayDeclaration: the callback closes over state setters only, so any dependency list keeps its behaviour.
    [],
  );

  const onSave = useCallback(() => {
    const request = toCheckTimeSaveRequest(draft);
    if (!request.ok) {
      setErrorMessage(request.message);
      return;
    }
    setErrorMessage(undefined);
    saveTime(request.time);
  }, [draft, saveTime]);

  // 8. Return
  return { view, isOpen, onOpenChange, draft, onDraftChange, isSaving: save.isPending, errorMessage, onSave };
}
