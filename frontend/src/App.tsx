import { Navigate, Route, Routes } from 'react-router';
import { BridgeDashboard } from './features/dashboard';
import { AppLayout } from './app/AppLayout';
import { BridgeStatusRoute } from './app/routes/BridgeStatusRoute';
import { NotFoundRoute } from './app/routes/NotFoundRoute';
import { ObservabilityRoute } from './app/routes/ObservabilityRoute';
import { PairingRoute } from './app/routes/PairingRoute';

function App() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route index element={<Navigate replace to="/dashboard" />} />
                <Route path="/dashboard" element={<BridgeDashboard />} />
                <Route path="/status" element={<BridgeStatusRoute />} />
                <Route path="/pairing" element={<PairingRoute />} />
                <Route path="/observability" element={<ObservabilityRoute />} />
                <Route path="*" element={<NotFoundRoute />} />
            </Route>
        </Routes>
    );
}

export default App;
