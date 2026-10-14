import refreshIcon from '@iconify-icons/tabler/refresh';
import { Icon } from '@iconify/react';
import { Alert, Button, Chip, Disclosure, ProgressBar, Tooltip, Typography } from '@heroui/react';
import editorArtwork from '../../../../assets/airis-empty-states/editor-library.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { EPISODE_ADD_LABEL, EPISODE_DURATIONS_TITLE } from './episode-durations-section.constants';
import type { EpisodeDurationsSectionProps } from './episode-durations-section.types';
import { EpisodeDurationsDialogs } from './EpisodeDurationsDialogs';
import { EpisodeDurationsTable } from './EpisodeDurationsTable';

/**
 * Renders the Editor's "Episodes" accordion, built like "More details": a
 * full-width secondary trigger that shows "N of M measured" and the long count
 * even while closed. Inside, the section never repeats its title. Its body is
 * exactly one of loading (a skeleton table), failure (the surface Alert), empty
 * (the inline Airis state) or the table, plus the state matrix's alert, the
 * analysis progress and the footer notes.
 */
export function EpisodeDurationsSection({ viewModel }: Readonly<EpisodeDurationsSectionProps>) {
  if (viewModel.view === 'idle') return null;
  const button = viewModel.reanalyzeButton;
  return (
    <>
      <Disclosure isExpanded={viewModel.isOpen} onExpandedChange={viewModel.onToggle}>
        <Disclosure.Heading>
          <Button className="w-full justify-between" slot="trigger" variant="secondary">
            {EPISODE_DURATIONS_TITLE}
            <span className="flex items-center gap-2">
              {viewModel.summary === undefined ? null : <span className="text-xs font-normal text-muted">{viewModel.summary.label}</span>}
              {viewModel.summary?.longLabel === undefined ? null : <Chip color="warning" size="sm" variant="soft">{viewModel.summary.longLabel}</Chip>}
              <Disclosure.Indicator />
            </span>
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="flex flex-col gap-3 pt-4">
            <div className="flex items-center justify-between gap-3">
              <Typography color="muted" type="body-sm">{viewModel.summary?.label}</Typography>
              <Tooltip delay={0}>
                <Tooltip.Trigger className="inline-flex shrink-0 rounded-full" role="presentation" tabIndex={-1}>
                  <Button aria-label={button.ariaLabel} className="hover:text-accent" isDisabled={button.isDisabled} isIconOnly size="sm" variant="secondary" onPress={() => void viewModel.onReanalyze()}>
                    <Icon aria-hidden="true" icon={refreshIcon} />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>{button.tooltip}</Tooltip.Content>
              </Tooltip>
            </div>
            {viewModel.banner === undefined ? null : (
              <Alert status={viewModel.banner.status}>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{viewModel.banner.title}</Alert.Title>
                  <Alert.Description>{viewModel.banner.description}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
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
            {viewModel.view === 'failed' ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Episode durations could not be loaded.</Alert.Title>
                  <Alert.Description>{viewModel.failureMessage}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            {viewModel.emptyCopy === undefined ? null : (
              <AirisEmptyState
                action={viewModel.isEditingLocked ? undefined : { label: EPISODE_ADD_LABEL, onPress: viewModel.onOpenAdd }}
                description={viewModel.emptyCopy.description}
                imageSrc={editorArtwork}
                size="inline"
                title={viewModel.emptyCopy.title}
              />
            )}
            {viewModel.view === 'loading' || viewModel.view === 'table' ? <EpisodeDurationsTable viewModel={viewModel} /> : null}
            {viewModel.notes.map((note) => <Typography color="muted" key={note} type="body-xs">{note}</Typography>)}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
      <EpisodeDurationsDialogs viewModel={viewModel} />
    </>
  );
}
