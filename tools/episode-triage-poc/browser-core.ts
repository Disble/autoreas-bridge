/** PROTOTYPE — disposable, NOT PRODUCTION. Browser bundle entry: SAME core, no duplicate. */
import { analyze } from "./analyze.ts";
import { parseLabel } from "./parse.ts";

// The report shell calls TriageCore.analyze for in-memory scenario controls.
(globalThis as Record<string, unknown>).TriageCore = { analyze, parseLabel };
