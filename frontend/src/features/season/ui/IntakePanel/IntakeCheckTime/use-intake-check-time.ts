import { Time } from '@internationalized/date';
import { useCallback, useEffect, useState } from 'react';
import { seasonSource } from '../../../../../infrastructure/season-source/season-source.helpers';
import { readCheckTime, saveCheckTime, toCheckTimeValue } from './intake-check-time.helpers';
import type { CheckTimeDraft, CheckTimePort } from './intake-check-time.types';

/**
 * Drives the intake card's daily availability check time: loads the saved
 * time once, opens a popover seeded with it, and saves an edited time,
 * closing on success and keeping the popover open with the reason on failure.
 * @param source The check time port.
 * @returns The saved time (`null` until known), the popover state and its handlers.
 */
export function useIntakeCheckTime(source: CheckTimePort = seasonSource) {
  // 2. State
  const [checkTime, setCheckTime] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<CheckTimeDraft>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // 6. Callbacks
  const onOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      // Stryker disable next-line ConditionalExpression: resetting on close too is unobservable, the closed popover renders neither draft nor error and the next open resets both.
      if (open) {
        // Stryker disable next-line StringLiteral: equivalent and unreachable, the trigger only renders once the time is known, and any non-HH:MM fallback parses to null alike.
        setDraft(toCheckTimeValue(checkTime ?? ''));
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

  const onSave = useCallback(async () => {
    setIsSaving(true);
    const result = await saveCheckTime(source, draft);
    setIsSaving(false);
    if (result.ok) {
      setCheckTime(result.time);
      setIsOpen(false);
      return;
    }
    setErrorMessage(result.message);
  }, [source, draft]);

  // 7. Effects
  useEffect(() => {
    let isCurrent = true;
    void readCheckTime(source).then((hhmm) => {
      if (isCurrent) {
        setCheckTime(hhmm);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [source]);

  // 8. Return
  return { checkTime, isOpen, onOpenChange, draft, onDraftChange, isSaving, errorMessage, onSave };
}
