import { useState, useEffect } from 'react';
import { Card, Chip, Spinner } from '@heroui/react';
import { GetSQLiteStatus } from '../../wailsjs/go/main/App';

export function BridgeStatus() {
    const [sqliteStatus, setSqliteStatus] = useState('');
    const loading = sqliteStatus === '';

    useEffect(() => {
        GetSQLiteStatus().then(setSqliteStatus);
    }, []);

    const isOk = sqliteStatus.toLowerCase().includes('ok') || sqliteStatus.toLowerCase().includes('open');

    return (
        <Card>
            <Card.Header>
                <Card.Title>Bridge Status</Card.Title>
                <Card.Description>Local service health</Card.Description>
            </Card.Header>
            <Card.Content>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">SQLite</span>
                    {loading ? (
                        <Spinner size="sm" />
                    ) : (
                        <Chip
                            color={isOk ? 'success' : 'danger'}
                            variant="soft"
                            size="sm"
                        >
                            <Chip.Label id="sqlite-status">{sqliteStatus}</Chip.Label>
                        </Chip>
                    )}
                </div>
            </Card.Content>
        </Card>
    );
}
