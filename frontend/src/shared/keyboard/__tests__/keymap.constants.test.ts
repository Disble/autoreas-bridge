import { describe, expect, it } from 'vitest';
import { KEYMAP_DOCUMENT_VERSION, SCOPED_COMMAND_BINDINGS } from '../keymap.constants';

describe('SCOPED_COMMAND_BINDINGS', () => {
  it('declares notification-center.mark-all-read with its id, scope, chord, label and section, exactly what R-6/62d adopts', () => {
    expect(SCOPED_COMMAND_BINDINGS['notification-center.mark-all-read']).toEqual({
      id: 'notification-center.mark-all-read',
      scope: 'notification-center',
      chord: 'alt+r',
      label: 'Mark all as read',
      section: 'Notifications',
    });
  });
});

describe('KEYMAP_DOCUMENT_VERSION', () => {
  it('is 1, the only version this change ever produces or reads', () => {
    expect(KEYMAP_DOCUMENT_VERSION).toBe(1);
  });
});
