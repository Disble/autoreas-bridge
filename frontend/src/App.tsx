import { useState } from 'react';
import { Card, Button, Spinner, Alert, Separator } from '@heroui/react';
import { TriggerReconcile } from '../wailsjs/go/main/App';
import { BridgeStatus } from './components/BridgeStatus';
import { PairingPanel } from './components/PairingPanel';

function App() {
    const [syncResult, setSyncResult] = useState('');
    const [syncing, setSyncing] = useState(false);

    function triggerSync() {
        setSyncing(true);
        setSyncResult('');
        TriggerReconcile()
            .then(setSyncResult)
            .finally(() => setSyncing(false));
    }

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="mx-auto flex max-w-md flex-col gap-4">
                {/* Header */}
                <header className="flex flex-col items-center gap-1 pb-2">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">
                        Autoreas Bridge
                    </h1>
                    <p className="text-sm text-muted">Desktop ↔ Mobile sync</p>
                </header>

                <BridgeStatus />

                <PairingPanel />

                {/* Sync Card */}
                <Card>
                    <Card.Header>
                        <Card.Title>Sync</Card.Title>
                        <Card.Description>
                            Manually trigger data reconciliation between devices
                        </Card.Description>
                    </Card.Header>
                    <Card.Content className="flex flex-col gap-3">
                        <Button
                            variant="primary"
                            fullWidth
                            onPress={triggerSync}
                            isDisabled={syncing}
                        >
                            {syncing && <Spinner size="sm" color="accent" />}
                            {syncing ? 'Reconciling…' : 'Trigger Reconcile'}
                        </Button>
                        {syncResult && (
                            <Alert status="success">
                                <Alert.Content>
                                    <Alert.Description>
                                        <span id="sync-result">{syncResult}</span>
                                    </Alert.Description>
                                </Alert.Content>
                            </Alert>
                        )}
                    </Card.Content>
                </Card>

                <Separator />

                <footer className="pb-4 text-center text-xs text-muted">
                    autoreas-bridge v0.1
                </footer>
            </div>
        </div>
    );
}

export default App;
