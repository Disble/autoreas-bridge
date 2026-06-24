import { Button, Card, Chip, Input, Label, Skeleton, TextField } from '@heroui/react';
import { JDCONFIG_PANEL_FORM_FIELDS } from './jdconfig-panel.constants';
import { useJDConfigPanel } from './use-jdconfig-panel';
import type { JDConfigPanelProps } from './jdconfig-panel.types';

/**
 * JDConfigPanel renders the JDownloader account/device configuration form
 * plus the live connection status. The password field is write-only: it is
 * always rendered empty and is only sent to the backend when the user types
 * a new value. All Wails calls and persistence logic live in the colocated
 * `useJDConfigPanel` hook; this component is presentation-only.
 */
export function JDConfigPanel({ className }: Readonly<JDConfigPanelProps>) {
  const { status, form, liveStatus, isSaving, saveErrorMessage, saveSucceeded, updateField, save } =
    useJDConfigPanel();

  if (status === 'loading') {
    return (
      <section aria-label="Loading JD account configuration" className={className}>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
        Failed to load JD account configuration.
      </p>
    );
  }

  return (
    <Card className={className}>
      <Card.Header>
        <Card.Title>JDownloader account</Card.Title>
        <Card.Description>Credentials and device settings used to dispatch downloads to JDownloader.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Connection</span>
            <Chip color={liveStatus.lastSeenStatus === 'online' ? 'success' : 'default'} size="sm" variant="soft">
              <Chip.Label>{liveStatus.lastSeenStatus}</Chip.Label>
            </Chip>
          </div>

          {saveErrorMessage !== undefined && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {saveErrorMessage}
            </p>
          )}

          {saveSucceeded && (
            <p aria-live="polite" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              JDownloader configuration saved.
            </p>
          )}

          {JDCONFIG_PANEL_FORM_FIELDS.map(({ field, label, type }) => (
            <TextField key={field}>
              <Label>{label}</Label>
              <Input
                fullWidth
                type={type}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
              />
            </TextField>
          ))}

          <div>
            <Button isDisabled={isSaving} variant="primary" onPress={() => void save()}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
