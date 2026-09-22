import { invokeGoBinding } from '../wails-bindings.helpers';
import type { ObservabilityFacts } from './observability-facts-source.types';

/**
 * Shape of the `GetObservabilityFacts` method as attached on `window.go`.
 * The call goes through `window.go` directly rather than the generated
 * `wailsjs` module because the generated surface lags this binding and is
 * regenerated out of band; the call shape is what the generated module
 * performs.
 */
type ObservabilityFactsBinding = { GetObservabilityFacts: () => Promise<ObservabilityFacts> };

/**
 * Reads the raw facts payload through the attached Go binding. Callers must
 * have confirmed the binding exists (invokeGoBinding does) before invoking.
 * @returns The raw binding payload.
 */
function readObservabilityFacts(): Promise<ObservabilityFacts> {
  return (window.go as unknown as { desktop: { App: ObservabilityFactsBinding } }).desktop.App.GetObservabilityFacts();
}

/**
 * Loads the desktop adapter's static observability facts through the Wails
 * binding, degrading to null whenever the binding is unavailable, the read
 * fails, or the adapter reports itself degraded — a surface must render its
 * fallback substance rather than a fabricated or zeroed number. Read failures
 * are contained before the payload is normalized, so the degrade guard observes
 * every resolved payload directly and the returned promise never rejects.
 * @returns The facts, or null when no trustworthy facts are available.
 */
export async function loadObservabilityFacts(): Promise<ObservabilityFacts | null> {
  const facts = await invokeGoBinding<ObservabilityFacts | null>(
    'GetObservabilityFacts',
    readObservabilityFacts,
    () => null,
  ).catch(() => null);

  return facts === null || facts.degraded ? null : facts;
}
