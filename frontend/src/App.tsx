import { useState } from 'react';
import './App.css';
import { TriggerReconcile } from '../wailsjs/go/main/App';
import { BridgeStatus } from './components/BridgeStatus';
import { PairingPanel } from './components/PairingPanel';

function App() {
    const [syncResult, setSyncResult] = useState('');

    function triggerSync() {
        TriggerReconcile().then(setSyncResult);
    }

    return (
        <div id="App">
            <h1>Autoreas Bridge</h1>
            <BridgeStatus />
            <PairingPanel />
            <section>
                <button type="button" onClick={triggerSync}>Trigger Sync</button>
                {syncResult && <span id="sync-result"> {syncResult}</span>}
            </section>
        </div>
    );
}

export default App;
