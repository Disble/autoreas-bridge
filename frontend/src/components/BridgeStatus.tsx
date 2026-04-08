import { useState, useEffect } from 'react';
import { GetSQLiteStatus } from '../../wailsjs/go/main/App';

export function BridgeStatus() {
    const [sqliteStatus, setSqliteStatus] = useState('…');

    useEffect(() => {
        GetSQLiteStatus().then(setSqliteStatus);
    }, []);

    return (
        <section>
            <h2>Bridge Status</h2>
            <div>
                <strong>SQLite:</strong>{' '}
                <span id="sqlite-status">{sqliteStatus}</span>
            </div>
        </section>
    );
}
