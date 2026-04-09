import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObservabilityPanel } from './ObservabilityPanel';

const getRecentLogsMock = vi.fn();
const eventsOnMock = vi.fn();

vi.mock('../../wailsjs/go/main/App', () => ({
    GetRecentLogs: () => getRecentLogsMock(),
}));

vi.mock('../../wailsjs/runtime/runtime', () => ({
    EventsOn: (eventName: string, callback: (...data: unknown[]) => void) => eventsOnMock(eventName, callback),
}));

describe('ObservabilityPanel', () => {
    afterEach(() => {
        getRecentLogsMock.mockReset();
        eventsOnMock.mockReset();
    });

    it('mounts and loads recent logs', async () => {
        getRecentLogsMock.mockResolvedValueOnce([
            { timestamp: '2026-04-08T00:00:00Z', domain: 'anime', level: 'info', message: 'booted' },
        ]);
        eventsOnMock.mockReturnValue(() => undefined);

        render(<ObservabilityPanel />);

        await waitFor(() => expect(getRecentLogsMock).toHaveBeenCalledTimes(1));
        expect(await screen.findByText('booted')).toBeInTheDocument();
    });

    it('appends entries from live events', async () => {
        let handler: ((entry: unknown) => void) | undefined;
        getRecentLogsMock.mockResolvedValueOnce([]);
        eventsOnMock.mockImplementation((_eventName: string, callback: (entry: unknown) => void) => {
            handler = callback;
            return () => undefined;
        });

        render(<ObservabilityPanel />);

        await waitFor(() => expect(getRecentLogsMock).toHaveBeenCalledTimes(1));
        handler?.({ timestamp: '2026-04-08T00:01:00Z', domain: 'sync', level: 'warn', message: 'queued reconcile' });

        expect(await screen.findByText('queued reconcile')).toBeInTheDocument();
        expect(eventsOnMock).toHaveBeenCalledWith('observability.log', expect.any(Function));
    });
});
