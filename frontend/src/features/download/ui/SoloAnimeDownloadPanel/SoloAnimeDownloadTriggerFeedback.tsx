import { Chip } from '@heroui/react';
import type { SoloAnimeDownloadTriggerFeedbackProps } from './solo-anime-download-panel.types';

/** Renders the outcome chip after a trigger attempt: success, already-in-progress, or nothing. */
export function SoloAnimeDownloadTriggerFeedback({ status }: Readonly<SoloAnimeDownloadTriggerFeedbackProps>) {
  if (status === 'success') {
    return (
      <Chip color="success" size="sm" variant="soft">
        <Chip.Label>Anime download started.</Chip.Label>
      </Chip>
    );
  }

  if (status === 'already-in-progress') {
    return (
      <Chip color="default" size="sm" variant="soft">
        <Chip.Label>A download check is already in progress.</Chip.Label>
      </Chip>
    );
  }

  return null;
}
