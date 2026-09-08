import { Alert, Typography } from '@heroui/react';
import { SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION } from './solo-anime-download-panel.constants';
import type { SoloAnimeDownloadSelectionAlertProps } from './solo-anime-download-panel.types';

/**
 * Renders the selection-dependent disclosure below the rail: a prompt while
 * nothing is picked, or the blocker sentence when the pick cannot start a
 * download. A ready selection renders neither.
 */
export function SoloAnimeDownloadSelectionAlert({ selected }: Readonly<SoloAnimeDownloadSelectionAlertProps>) {
  if (selected === undefined) {
    return (
      <Typography color="muted" type="body-sm">
        {SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION}
      </Typography>
    );
  }

  if (selected.ready) {
    return null;
  }

  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{selected.name} cannot start a download check.</Alert.Title>
        <Alert.Description>{selected.reasonLabels.join(' ')}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
