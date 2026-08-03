import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './app/AppLayout/AppLayout';
import { ActivityRoute } from './app/routes/ActivityRoute';
import { AnimeDetailRoute } from './app/routes/AnimeDetailRoute';
import { AnimeEditorRoute } from './app/routes/AnimeEditorRoute';
import { CatalogRoute } from './app/routes/CatalogRoute';
import { DevicesRoute } from './app/routes/DevicesRoute';
import { HistoryRoute } from './app/routes/HistoryRoute';
import { EpisodesRoute } from './app/routes/EpisodesRoute';
import { DownloadsRoute } from './app/routes/DownloadsRoute';
import { NotFoundRoute } from './app/routes/NotFoundRoute';
import { PreferencesRoute } from './app/routes/PreferencesRoute/PreferencesRoute';
import { SeasonRoute } from './app/routes/SeasonRoute';

function App() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route index element={<Navigate replace to="/today" />} />
                <Route path="/today" element={<EpisodesRoute />} />
                <Route path="/episodes" element={<Navigate replace to="/today" />} />
                <Route path="/dashboard" element={<Navigate replace to="/today" />} />
                <Route path="/catalog" element={<CatalogRoute />} />
                <Route path="/catalog/detail/:id" element={<AnimeDetailRoute />} />
                <Route path="/editor" element={<AnimeEditorRoute />} />
                <Route path="/editor/:id" element={<AnimeEditorRoute />} />
                <Route path="/history" element={<HistoryRoute />} />
                <Route path="/downloads" element={<DownloadsRoute />} />
                <Route path="/devices" element={<DevicesRoute />} />
                <Route path="/pairing" element={<Navigate replace to="/devices" />} />
                <Route path="/activity" element={<ActivityRoute />} />
                <Route path="/activity/runtime-events" element={<ActivityRoute initialTab="runtime-events" />} />
                <Route path="/events" element={<Navigate replace to="/activity/runtime-events" />} />
                <Route path="/network" element={<Navigate replace to="/activity" />} />
                <Route path="/status" element={<Navigate replace to="/activity" />} />
                <Route path="/season" element={<SeasonRoute />} />
                <Route path="/settings" element={<PreferencesRoute />} />
                <Route path="/preferences" element={<Navigate replace to="/settings" />} />
                <Route path="*" element={<NotFoundRoute />} />
            </Route>
        </Routes>
    );
}

export default App;
