import { Button, Chip } from '@heroui/react';
import { useManualTriggerButton } from './use-manual-trigger-button';
import type { ManualTriggerButtonProps } from './manual-trigger-button.types';

/**
 * ManualTriggerButton renders a single button that asks the backend
 * scheduler to run an immediate out-of-band download check, surfacing the
 * idle/triggering/already-in-progress/error/success lifecycle inline. All
 * Wails calls live in the colocated `useManualTriggerButton` hook; this
 * component is presentation-only.
 */
export function ManualTriggerButton({ className }: Readonly<ManualTriggerButtonProps>) {
  const { viewModel, trigger } = useManualTriggerButton();

  return (
    <section aria-label="Manual download check" className={`flex flex-col gap-2 ${className ?? ''}`}>
      <Button isDisabled={viewModel.status === 'triggering'} variant="primary" onPress={() => void trigger()}>
        {viewModel.status === 'triggering' ? 'Checking now…' : 'Trigger download check now'}
      </Button>

      {viewModel.status === 'success' && (
        <Chip color="success" size="sm" variant="soft">
          <Chip.Label>Download check started.</Chip.Label>
        </Chip>
      )}

      {viewModel.status === 'already-in-progress' && (
        <Chip color="default" size="sm" variant="soft">
          <Chip.Label>A download check is already in progress.</Chip.Label>
        </Chip>
      )}

      {viewModel.status === 'error' && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {viewModel.errorMessage ?? 'Failed to trigger the download check.'}
        </p>
      )}
    </section>
  );
}
