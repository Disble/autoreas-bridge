import chevronDownIcon from '@iconify-icons/tabler/chevron-down';
import chevronUpIcon from '@iconify-icons/tabler/chevron-up';
import refreshIcon from '@iconify-icons/tabler/refresh';
import { Icon } from '@iconify/react';
import { Alert, Button, Card, Chip, ProgressBar, Tooltip, Typography } from '@heroui/react';
import {
  EPISODE_DURATIONS_BODY_ID,
  EPISODE_DURATIONS_DESCRIPTION,
  EPISODE_DURATIONS_SAVE_FAILED_TITLE,
  EPISODE_DURATIONS_SAVE_LABEL,
  EPISODE_DURATIONS_TITLE,
} from './episode-durations-section.constants';
import type { EpisodeDurationsSectionProps } from './episode-durations-section.types';
import { EpisodeDurationsBody } from './EpisodeDurationsBody';
import { EpisodeDurationsDialogs } from './EpisodeDurationsDialogs';

/**
 * Renders the Editor's Episodes card (S15), independent of the anime data card.
 * Its header carries the title, the measured and long chips, the icon-only
 * Re-analyze folder (its tooltip names it, and the disabled reason) and the Show/Hide toggle; the table body is hidden by default. The footer holds the card's own draft:
 * its unsaved count, Discard changes and Save episodes.
 */
export function EpisodeDurationsSection({ viewModel }: Readonly<EpisodeDurationsSectionProps>) {
  if (viewModel.view === 'idle') return null;
  const button = viewModel.reanalyzeButton;
  const footer = viewModel.footer;
  return (
    <>
      <Card className="min-w-0">
        <Card.Header className="flex flex-row flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            <Card.Title>{EPISODE_DURATIONS_TITLE}</Card.Title>
            <Card.Description>{EPISODE_DURATIONS_DESCRIPTION}</Card.Description>
          </div>
          {viewModel.summary === undefined ? null : <Chip color="success" size="sm" variant="soft">{viewModel.summary.label}</Chip>}
          {viewModel.summary?.longLabel === undefined ? null : <Chip color="warning" size="sm" variant="soft">{viewModel.summary.longLabel}</Chip>}
          <Tooltip delay={0}>
            <Tooltip.Trigger className="inline-flex shrink-0 rounded-full" role="presentation" tabIndex={-1}>
              <Button isIconOnly aria-label={button.ariaLabel} className="hover:text-accent" isDisabled={button.isDisabled} variant="secondary" onPress={() => void viewModel.onReanalyze()}>
                <Icon aria-hidden="true" className="size-[18px]" icon={refreshIcon} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              {button.tooltip}
            </Tooltip.Content>
          </Tooltip>
          <Button aria-controls={EPISODE_DURATIONS_BODY_ID} aria-expanded={viewModel.isOpen} variant="secondary" onPress={viewModel.onToggle}>
            {viewModel.toggleLabel}
            <Icon aria-hidden="true" icon={viewModel.isOpen ? chevronUpIcon : chevronDownIcon} />
          </Button>
        </Card.Header>
        <Card.Content className="flex min-w-0 flex-col gap-3">
          {viewModel.progress === undefined ? null : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Typography type="body-sm">{viewModel.progress.label}</Typography>
                <Button size="sm" variant="tertiary" onPress={viewModel.onCancelAnalysis}>Cancel</Button>
              </div>
              <ProgressBar aria-label={viewModel.progress.label} size="sm" value={viewModel.progress.percent}>
                <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
              </ProgressBar>
            </div>
          )}
          {viewModel.isOpen ? <EpisodeDurationsBody viewModel={viewModel} /> : null}
          {viewModel.saveError === undefined ? null : (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{EPISODE_DURATIONS_SAVE_FAILED_TITLE}</Alert.Title>
                <Alert.Description>{viewModel.saveError}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </Card.Content>
        {footer.isVisible ? (
          <Card.Footer className="flex flex-wrap items-center gap-3 border-t border-divider pt-3">
            <Typography color="muted" type="body-sm">{footer.unsavedLabel}</Typography>
            <Button className="ml-auto" isDisabled={!footer.canDiscard} variant="tertiary" onPress={viewModel.onDiscard}>Discard changes</Button>
            <Button isDisabled={!footer.canSave} isPending={viewModel.isSaving} variant="primary" onPress={() => void viewModel.onSave()}>{EPISODE_DURATIONS_SAVE_LABEL}</Button>
          </Card.Footer>
        ) : null}
      </Card>
      <EpisodeDurationsDialogs viewModel={viewModel} />
    </>
  );
}
