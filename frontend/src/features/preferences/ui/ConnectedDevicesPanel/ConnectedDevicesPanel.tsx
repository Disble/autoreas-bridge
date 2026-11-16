import { Alert, Button, Chip, Skeleton, Table } from '@heroui/react';
import { CONNECTED_DEVICES_EMPTY_MESSAGE, CONNECTED_DEVICES_LOADING_LABEL, CONNECTED_DEVICES_SKELETON_ROW_COUNT } from './connected-devices-panel.constants';
import { getConnectionStatusColor } from './connected-devices-panel.helpers';
import type { ConnectedDevicesPanelProps } from './connected-devices-panel.types';
import { useConnectedDevicesPanel } from './use-connected-devices-panel';

/**
 * Renders the Configs subsection for paired device sync status and unpair actions.
 * While the list loads, the table keeps its header and renders skeleton rows,
 * marked `aria-busy`, with a labelled status region beside it (a status region
 * cannot nest inside table markup).
 */
export function ConnectedDevicesPanel(props: Readonly<ConnectedDevicesPanelProps>) {
  const { unpairDevice, view } = useConnectedDevicesPanel(props);

  if (view.kind === 'failure') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>Connected devices unavailable</Alert.Title>
          <Alert.Description>{view.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (view.kind === 'empty') {
    return <p className="text-sm text-muted">{CONNECTED_DEVICES_EMPTY_MESSAGE}</p>;
  }

  return (
    <>
      {view.kind === 'loading' ? (
        <div aria-labelledby="connected-devices-loading-label" aria-live="polite" className="sr-only" role="status">
          <span id="connected-devices-loading-label">{CONNECTED_DEVICES_LOADING_LABEL}</span>
        </div>
      ) : null}
      <Table aria-busy={view.kind === 'loading' || view.isRefreshing}>
        <Table.ScrollContainer>
          <Table.Content className="w-full table-fixed">
            <Table.Header>
              <Table.Column isRowHeader>Device</Table.Column>
              <Table.Column>Last sync</Table.Column>
              <Table.Column>Status</Table.Column>
              <Table.Column>Sync pruning</Table.Column>
              <Table.Column>Actions</Table.Column>
            </Table.Header>
            <Table.Body>
              {view.kind === 'loading'
                ? Array.from({ length: CONNECTED_DEVICES_SKELETON_ROW_COUNT }, (_unused, index) => (
                    <Table.Row data-testid="connected-devices-skeleton-row" id={`skeleton-${index}`} isDisabled key={`skeleton-${index}`}>
                      <Table.Cell>
                        <Skeleton className="block h-4 w-32 rounded" />
                        <Skeleton className="mt-1 block h-3 w-24 rounded" />
                      </Table.Cell>
                      <Table.Cell><Skeleton className="h-3.5 w-28 rounded" /></Table.Cell>
                      <Table.Cell><Skeleton className="h-6 w-24 rounded-full" /></Table.Cell>
                      <Table.Cell><Skeleton className="h-3.5 w-20 rounded" /></Table.Cell>
                      <Table.Cell><Skeleton className="h-8 w-16 rounded-lg" /></Table.Cell>
                    </Table.Row>
                  ))
                : view.data.map((device) => (
                    <Table.Row key={device.id}>
                      <Table.Cell>
                        <span className="block truncate font-medium text-foreground">{device.name}</span>
                        <span className="block truncate text-xs text-muted">{device.id}</span>
                      </Table.Cell>
                      <Table.Cell>{device.lastSyncLabel}</Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" color={getConnectionStatusColor(device.connectionStatus, device.syncStatus)} variant="soft">
                          {device.connectionStatus}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>{device.blocksPruning ? 'Blocking' : 'Not blocking'}</Table.Cell>
                      <Table.Cell>
                        <Button size="sm" variant="danger" onPress={() => unpairDevice(device.id)}>
                          Unpair
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </>
  );
}
