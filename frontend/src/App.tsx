import { Navigate, Route, Routes } from 'react-router';
import { BridgeDashboard } from './features/dashboard/ui/BridgeDashboard/BridgeDashboard';
import { AppLayout } from './app/AppLayout';
import { AnimeDetailRoute } from './app/routes/AnimeDetailRoute';
import { CatalogRoute } from './app/routes/CatalogRoute';
import { HistoryRoute } from './app/routes/HistoryRoute';
import { BridgeStatusRoute } from './app/routes/BridgeStatusRoute';
import { DownloadsRoute } from './app/routes/DownloadsRoute';
import { NetworkRoute } from './app/routes/NetworkRoute';
import { NotFoundRoute } from './app/routes/NotFoundRoute';
import { PairingRoute } from './app/routes/PairingRoute';
import { PreferencesRoute } from './app/routes/PreferencesRoute';

function App() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route index element={<Navigate replace to="/network" />} />
                <Route path="/network" element={<NetworkRoute />} />
                <Route path="/dashboard" element={<BridgeDashboard />} />
                <Route path="/catalog" element={<CatalogRoute />} />
                <Route path="/catalog/detail/:id" element={<AnimeDetailRoute />} />
                <Route path="/history" element={<HistoryRoute />} />
                <Route path="/downloads" element={<DownloadsRoute />} />
                <Route path="/status" element={<BridgeStatusRoute />} />
                <Route path="/pairing" element={<PairingRoute />} />
                <Route path="/preferences" element={<PreferencesRoute />} />
                <Route path="*" element={<NotFoundRoute />} />
            </Route>
        </Routes>
    );
}

export default App;
