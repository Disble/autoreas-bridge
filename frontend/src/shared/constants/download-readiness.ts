import type { DownloadReadinessReason } from '../contracts/download.types';

/**
 * Maps stable backend readiness codes to the correction users need to make.
 */
export function getDownloadReadinessReasonLabel(reason: DownloadReadinessReason): string {
  switch (reason) {
    case 'missing_source':
      return 'Source page is missing.';
    case 'invalid_source':
      return 'Source page is invalid.';
    case 'unsupported_source':
      return 'This source is not supported for downloads.';
    case 'destination_unresolved':
      return 'Download destination could not be resolved.';
  }
}
