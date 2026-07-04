import { Alert, Button, Chip, Table } from '@heroui/react';
import { CONNECTED_DEVICES_EMPTY_MESSAGE } from './connected-devices-panel.constants';
import type { ConnectedDevicesPanelProps } from './connected-devices-panel.types';
import { useConnectedDevicesPanel } from './use-connected-devices-panel';

/**
 * Renders the Configs subsection for paired device sync status and unpair actions.
 */
export function ConnectedDevicesPanel(props: Readonly<ConnectedDevicesPanelProps>) {
  const { errorMessage, isLoading, rows, unpairDevice } = useConnectedDevicesPanel(props);

  if (errorMessage !== '') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>Connected devices unavailable</Alert.Title>
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (rows.length === 0 && !isLoading) {
    return <p className="text-sm text-muted">{CONNECTED_DEVICES_EMPTY_MESSAGE}</p>;
  }

  return (
    <Table>
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
            {rows.map((device) => (
              <Table.Row key={device.id}>
                <Table.Cell>
                  <span className="block truncate font-medium text-foreground">{device.name}</span>
                  <span className="block truncate text-xs text-muted">{device.id}</span>
                </Table.Cell>
                <Table.Cell>{device.lastSyncLabel}</Table.Cell>
                <Table.Cell>
                  <Chip size="sm" color={device.syncStatus === 'stale' ? 'warning' : 'default'} variant="soft">
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
  );
}
