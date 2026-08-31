import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NetworkMetadataEntryViewModel } from '../../NetworkPanel/network-panel.types';
import { NetworkDetailMetadata } from '../NetworkDetailMetadata';

/**
 * DOM-level guard for the Metadata tab.
 *
 * The projection tests prove the string is right; this file proves the tab
 * actually shows it. The reported defect was visible only here — a `probes`
 * array reached the user as the literal text `[object Object]`.
 */

/** The pretty-printed `probes` array a download event carries. */
const PROBES_JSON = ['[', '  {', '    "host": "jd-01"', '  }', ']'].join('\n');

/** Compares a candidate node's text exactly, newlines and indentation included. */
const EXACT = { normalizer: (text: string) => text };

/** Builds one projected metadata row. */
function entry(key: string, value: string, isMultiline: boolean): NetworkMetadataEntryViewModel {
  return { key, value, isMultiline };
}

describe('NetworkDetailMetadata', () => {
  afterEach(cleanup);

  it('states that there is no metadata rather than rendering an empty grid', () => {
    render(<NetworkDetailMetadata metadataEntries={[]} />);

    expect(screen.getByText('No metadata.')).toBeInTheDocument();
  });

  it('renders a structured value as readable JSON instead of "[object Object]"', () => {
    render(<NetworkDetailMetadata metadataEntries={[entry('probes', PROBES_JSON, true)]} />);

    expect(screen.getByText('probes')).toBeInTheDocument();
    expect(screen.getByText(PROBES_JSON, EXACT)).toBeInTheDocument();
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });

  it('gives a multiline value a preformatted, monospaced face so its structure survives', () => {
    render(<NetworkDetailMetadata metadataEntries={[entry('probes', PROBES_JSON, true)]} />);

    const value = screen.getByText(PROBES_JSON, EXACT);

    expect(value).toHaveClass('whitespace-pre-wrap');
    expect(value).toHaveClass('font-mono');
    expect(value).toHaveClass('break-all');
  });

  it('leaves a single-line value looking exactly as it did before', () => {
    render(<NetworkDetailMetadata metadataEntries={[entry('path', '/api/status', false)]} />);

    const value = screen.getByText('/api/status');

    expect(value).toHaveClass('break-all');
    expect(value).toHaveClass('text-sm');
    expect(value).not.toHaveClass('font-mono');
    expect(value).not.toHaveClass('whitespace-pre-wrap');
  });

  it('renders every entry it is given, mixing structured and primitive values', () => {
    render(
      <NetworkDetailMetadata
        metadataEntries={[entry('device', '{}', false), entry('probes', PROBES_JSON, true), entry('stage', 'probe', false)]}
      />,
    );

    expect(screen.getByText('device')).toBeInTheDocument();
    expect(screen.getByText('probes')).toBeInTheDocument();
    expect(screen.getByText('stage')).toBeInTheDocument();
  });
});
