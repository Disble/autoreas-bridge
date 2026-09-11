import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ListBox, Select, Table } from '@heroui/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushKeyboardScopeFrame, resetKeyboardStore } from '../../../keyboard-scope.helpers';
import type { CommandDefinition, KeyboardScopeFrame } from '../../../keyboard.types';
import { KeyboardDispatcherListener } from '../KeyboardDispatcherListener';

/** Renders the live router location so an assertion reads where the app landed, not which function ran. */
function LocationProbe() {
  const location = useLocation();

  return <span data-testid="landed-on">{location.pathname}</span>;
}

/**
 * Pushes a global scope frame carrying one command bound to `chord` -- the
 * exact chord a real widget below is about to claim. This is deliberately
 * NOT one of the shipped `KEYBOARD_COMMANDS` entries: the point of R-4 is to
 * prove the dispatcher's `event.defaultPrevented` guard (D5) actually fires
 * against a chord that WOULD otherwise resolve to a command, not merely that
 * no shipped command happens to share a rarely-bound key. Asserting the
 * probe's `run` was never called is therefore direct evidence of the guard,
 * not a coincidence of the registry's current contents.
 */
function pushProbeCommand(id: number, chord: string, run: () => void): KeyboardScopeFrame {
  const command: CommandDefinition = { id: 'test.probe', scope: 'global', chord, label: 'Probe', section: 'Navigation', run };
  const frame: KeyboardScopeFrame = { id, scope: 'global', getCommands: () => [command] };
  pushKeyboardScopeFrame(frame);
  return frame;
}

beforeEach(resetKeyboardStore);
afterEach(() => {
  cleanup();
  resetKeyboardStore();
});

describe('KeyboardDispatcherListener alongside real HeroUI widgets (R-4, D5)', () => {
  it('lets a focused Table row keep its own ArrowDown navigation and never runs a command claiming the same chord', () => {
    const run = vi.fn();
    pushProbeCommand(1, 'arrowdown', run);

    render(
      <MemoryRouter>
        <KeyboardDispatcherListener />
        <Table aria-label="Probe table">
          <Table.ScrollContainer>
            <Table.Content aria-label="Probe table" selectionMode="none">
              <Table.Header>
                <Table.Column isRowHeader>Title</Table.Column>
              </Table.Header>
              <Table.Body>
                <Table.Row id="row-1">
                  <Table.Cell>First</Table.Cell>
                </Table.Row>
                <Table.Row id="row-2">
                  <Table.Cell>Second</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </MemoryRouter>,
    );

    const firstRow = screen.getByRole('row', { name: 'First' });
    firstRow.focus();
    const notCancelled = fireEvent.keyDown(firstRow, { key: 'ArrowDown', code: 'ArrowDown' });

    // A native `dispatchEvent` returns `false` when some listener called
    // `preventDefault()` -- proving the Table's own row navigation claimed
    // the key before our `window` bubble-phase listener ever observed it.
    expect(notCancelled).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('row', { name: 'Second' }));
    expect(run).not.toHaveBeenCalled();
  });

  it('lets an open Select keep its own Escape handling and never runs a command claiming the same chord', async () => {
    const run = vi.fn();
    pushProbeCommand(2, 'escape', run);

    render(
      <MemoryRouter>
        <KeyboardDispatcherListener />
        <Select aria-label="Probe select">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="alpha" textValue="Alpha">
                Alpha
              </ListBox.Item>
              <ListBox.Item id="beta" textValue="Beta">
                Beta
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </MemoryRouter>,
    );

    // The trigger's accessible name combines the placeholder value span with
    // the `aria-label` (React Aria's own `aria-labelledby` composition), so
    // it is queried by role alone -- it is the only button this tree renders.
    fireEvent.click(screen.getByRole('button'));
    const listbox = await screen.findByRole('listbox');

    const notCancelled = fireEvent.keyDown(listbox, { key: 'Escape', code: 'Escape' });

    expect(notCancelled).toBe(false);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('dispatches a real, unclaimed Alt+1 keydown to a real navigation, so the two guard proofs above are not vacuous', async () => {
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <KeyboardDispatcherListener />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { key: '1', code: 'Digit1', altKey: true });

    expect(await screen.findByTestId('landed-on')).toHaveTextContent('/today');
  });
});
