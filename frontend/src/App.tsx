import { useState, useEffect } from 'react';
import './App.css';
import { GetBridgeStatus, GetEffectiveAddress, TriggerReconcile } from '../wailsjs/go/main/App';

function App() {
    const [bridgeStatus, setBridgeStatus] = useState('…');
    const [effectiveAddress, setEffectiveAddress] = useState('…');
    const [syncResult, setSyncResult] = useState('');

    useEffect(() => {
        GetBridgeStatus().then(setBridgeStatus);
        GetEffectiveAddress().then(setEffectiveAddress);
    }, []);

    function triggerSync() {
        TriggerReconcile().then(setSyncResult);
    }

    return (
        <div id="App">
            <h1>Autoreas Bridge</h1>
            <div>
                <strong>Status:</strong> <span id="bridge-status">{bridgeStatus}</span>
            </div>
            <div>
                <strong>LAN Address:</strong> <span id="effective-address">{effectiveAddress}</span>
            </div>
            <div>
                <button type="button" onClick={triggerSync}>Trigger Sync</button>
                {syncResult && <span id="sync-result"> {syncResult}</span>}
            </div>
        </div>
    );
}

export default App;
