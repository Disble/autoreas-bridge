import { Navigate, Route, Routes } from 'react-router';
import { BridgeDashboard } from './features/dashboard/ui/BridgeDashboard/BridgeDashboard';
import { AppLayout } from './app/AppLayout';
import { AnimeRoute } from './app/routes/AnimeRoute';
import { BridgeStatusRoute } from './app/routes/BridgeStatusRoute';
import { NetworkRoute } from './app/routes/NetworkRoute';
import { NotFoundRoute } from './app/routes/NotFoundRoute';
import { PairingRoute } from './app/routes/PairingRoute';

function App() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route index element={<Navigate replace to="/network" />} />
                <Route path="/network" element={<NetworkRoute />} />
                <Route path="/dashboard" element={<BridgeDashboard />} />
                <Route path="/animes" element={<AnimeRoute />} />
                <Route path="/status" element={<BridgeStatusRoute />} />
                <Route path="/pairing" element={<PairingRoute />} />
                <Route path="*" element={<NotFoundRoute />} />
            </Route>
        </Routes>
    );
}

export default App;
