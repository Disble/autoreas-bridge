import { Alert, Button } from '@heroui/react';
import type { DailyBoardNoticesProps } from './daily-board.types';

/**
 * DailyBoardNotices renders the board's two banners: the screen's failure
 * message, and the late-send notice that offers its own download action so a
 * batch sent after the auto-download window can still be watched today.
 * @param props The failure message, the notice, and the notice's two actions.
 */
export function DailyBoardNotices({ errorMessage, downloadNotice, onDownloadNow, onDismissNotice }: DailyBoardNoticesProps) {
  return (
    <>
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {downloadNotice !== null && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>
              Sent to Ver hoy after today&apos;s {downloadNotice.downloadTime || 'scheduled'} auto-download. Download now
              so you have episodes to watch today.
            </Alert.Description>
          </Alert.Content>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onPress={onDownloadNow}>
              Download now
            </Button>
            <Button size="sm" variant="tertiary" onPress={onDismissNotice}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}
    </>
  );
}
