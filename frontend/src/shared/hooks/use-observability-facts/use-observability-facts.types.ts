import type { ObservabilityFacts } from '../../../infrastructure/observability-facts-source/observability-facts-source.types';

/**
 * Reads the desktop adapter's static observability facts. Implementations
 * degrade to null whenever no trustworthy facts are available and never
 * reject, so an effect can safely fire-and-forget the read.
 */
export type ObservabilityFactsLoader = () => Promise<ObservabilityFacts | null>;
