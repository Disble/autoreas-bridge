import { describe, expect, it } from 'vitest';
import {
  KEYMAP_PANEL_ERROR_MESSAGE,
  KEYMAP_PANEL_ERROR_TITLE,
  KEYMAP_PANEL_LOADING_LABEL,
  KEYMAP_ROW_CLASS,
  KEYMAP_SKELETON_ROW_COUNT,
} from '../keymap-panel.constants';

describe('KEYMAP_ROW_CLASS', () => {
  it('is a non-empty class string, shared between the real row and its skeleton', () => {
    expect(KEYMAP_ROW_CLASS.length).toBeGreaterThan(0);
  });
});

describe('KEYMAP_SKELETON_ROW_COUNT', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(KEYMAP_SKELETON_ROW_COUNT)).toBe(true);
    expect(KEYMAP_SKELETON_ROW_COUNT).toBeGreaterThan(0);
  });
});

describe('panel copy strings', () => {
  it('KEYMAP_PANEL_LOADING_LABEL, KEYMAP_PANEL_ERROR_TITLE and KEYMAP_PANEL_ERROR_MESSAGE are all non-empty', () => {
    expect(KEYMAP_PANEL_LOADING_LABEL.length).toBeGreaterThan(0);
    expect(KEYMAP_PANEL_ERROR_TITLE.length).toBeGreaterThan(0);
    expect(KEYMAP_PANEL_ERROR_MESSAGE.length).toBeGreaterThan(0);
  });
});
