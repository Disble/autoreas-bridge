import { Alert } from '@heroui/react';
import { useId } from 'react';
import { AirisEmptyState } from '../AirisEmptyState/AirisEmptyState';
import { LookupCandidateSkeleton } from './LookupCandidateSkeleton';
import type { LookupErrorAlertProps, LookupModalResultsProps } from './lookup-modal.types';

/**
 * The danger alert a lookup shows for a failed search or a failed confirm.
 */
export function LookupErrorAlert({ title, message }: Readonly<LookupErrorAlertProps>) {
  return (
    <Alert status="danger">
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

/**
 * The lookup's candidate area: exactly one of its mutually exclusive states
 * (design D8) -- the loading skeleton in a labelled status region, the
 * failure alert, the filtered empty state, or the caller's rows -- and
 * nothing while idle.
 */
export function LookupModalResults({
  copy,
  query,
  state,
  errorMessage,
  hasCandidates,
  children,
}: Readonly<LookupModalResultsProps>) {
  const loadingLabelId = useId();

  if (state === 'loading') {
    return (
      <div aria-labelledby={loadingLabelId} aria-live="polite" className="flex flex-col gap-2" role="status">
        <span className="sr-only" id={loadingLabelId}>
          {copy.loadingLabel}
        </span>
        <LookupCandidateSkeleton />
      </div>
    );
  }
  if (state === 'failed') {
    return <LookupErrorAlert message={errorMessage} title={copy.errorTitle} />;
  }
  if (state === 'idle') {
    return null;
  }
  if (!hasCandidates) {
    return <AirisEmptyState description={copy.emptyDescription} kind="filtered" title={copy.emptyTitle(query)} />;
  }
  return (
    <div aria-label={copy.listLabel} className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
      {children}
    </div>
  );
}
