import { Alert } from '@heroui/react';
import todayAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { NOTIFICATION_EMPTY_STATE_COPY } from './notification-empty-state.constants';
import { selectNotificationEmptyState } from './notification-empty-state.helpers';
import type { NotificationEmptyStateProps } from './notification-empty-state.types';

/**
 * Dumb render of one of the six notification-list renderings, selected from
 * the current list conditions (design.md §9.3). Meant to be passed as
 * `NotificationTable`'s `renderEmptyState` render prop.
 *
 * The never-recorded list borrows the Today pose (calendar and clock: "once
 * something happens") until a notifications pose exists; the mascot catalog
 * is open for new poses (docs/design/patterns/empty-states.md).
 */
export function NotificationEmptyState(props: Readonly<NotificationEmptyStateProps>) {
  const stateId = selectNotificationEmptyState(props);
  const { description, kind, title } = NOTIFICATION_EMPTY_STATE_COPY[stateId];

  return (
    <div className="p-2" data-empty-state={stateId}>
      {kind === 'failure' ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{title}</Alert.Title>
            <Alert.Description>{description}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : kind === 'first-run' ? (
        <AirisEmptyState description={description} imageSrc={todayAirisArtwork} size="section" title={title} />
      ) : (
        <AirisEmptyState description={description} kind={kind} size="section" title={title} />
      )}
    </div>
  );
}
