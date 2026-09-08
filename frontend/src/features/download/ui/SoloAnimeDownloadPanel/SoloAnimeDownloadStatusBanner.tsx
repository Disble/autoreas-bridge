import { Alert, Button } from '@heroui/react';
import { SOLO_ANIME_DOWNLOAD_LOADING_LABEL } from './solo-anime-download-panel.constants';
import { SoloAnimeDownloadSkeleton } from './SoloAnimeDownloadSkeleton';
import type { SoloAnimeDownloadStatusBannerProps } from './solo-anime-download-panel.types';

/**
 * Renders the panel's top-level status disclosure: the loading skeleton, a
 * retryable readiness failure, or a download-start failure — whichever the
 * current status names. Renders nothing for every other status.
 */
export function SoloAnimeDownloadStatusBanner({
  status,
  errorMessage,
  onRetry,
}: Readonly<SoloAnimeDownloadStatusBannerProps>) {
  if (status === 'loading') {
    return (
      <div
        aria-labelledby="solo-anime-download-loading-label"
        aria-live="polite"
        className="flex flex-col gap-0.5"
        role="status"
      >
        <span className="sr-only" id="solo-anime-download-loading-label">
          {SOLO_ANIME_DOWNLOAD_LOADING_LABEL}
        </span>
        <SoloAnimeDownloadSkeleton />
      </div>
    );
  }

  if (status === 'readiness-error') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Download readiness unavailable</Alert.Title>
          <Alert.Description>{errorMessage ?? 'The readiness query failed.'}</Alert.Description>
          <Button className="mt-3" variant="secondary" onPress={onRetry}>
            Retry
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  if (status === 'trigger-error') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Download could not start</Alert.Title>
          <Alert.Description>{errorMessage ?? 'The download could not start.'}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return null;
}
