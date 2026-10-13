import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Completed Stryker statuses, in the order every emitted summary must keep. */
const AUDIT_STATUSES = ['Killed', 'Survived', 'NoCoverage', 'Timeout', 'Ignored', 'CompileError'];

/**
 * Whether a value is a plain record rather than an array, null or scalar.
 * @param {unknown} value Candidate report section.
 * @returns {boolean} True only for a non-null, non-array object.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rejects reports without a files object and returns the per-file entries.
 * @param {object} report Parsed Stryker JSON.
 * @returns {Array<object>} Per-file report entries in object order.
 */
function readAuditableFiles(report) {
  if (!isRecord(report?.files)) throw new Error('Invalid mutation report: files are missing.');
  return Object.values(report.files);
}

/**
 * Whether a per-file entry carries the mutant list the audit counts.
 * @param {object} file Per-file report entry.
 * @returns {boolean} True when the entry exposes an array of mutants.
 */
function hasMutantList(file) {
  return Array.isArray(file?.mutants);
}

/**
 * Adds one mutant's status to the running counts after rejecting unknown statuses.
 * @param {object} mutant Single mutant result.
 * @param {object} counts Running status counts, mutated in place.
 * @returns {void} Nothing; throws when the status is not a completed result.
 */
function addMutantCount(mutant, counts) {
  const status = mutant?.status;
  if (!Object.hasOwn(counts, status)) throw new Error('Incomplete mutation execution: ' + status);
  counts[status] += 1;
}

/**
 * Counts one file's mutants after rejecting malformed mutant lists.
 * @param {object} file Per-file report entry.
 * @param {object} counts Running status counts, mutated in place.
 * @returns {void} Nothing; throws when the mutant list is missing.
 */
function addFileCounts(file, counts) {
  if (!hasMutantList(file)) throw new Error('Invalid per-file mutant data.');
  for (const mutant of file.mutants) {
    addMutantCount(mutant, counts);
  }
}

/**
 * Counts only statuses from completed executions, preserving the six-status shape.
 * @param {Array<object>} files Per-file report entries.
 * @returns {object} Status counts for every completed Stryker status.
 */
function countAuditStatuses(files) {
  const counts = Object.fromEntries(AUDIT_STATUSES.map((status) => [status, 0]));
  for (const file of files) {
    addFileCounts(file, counts);
  }
  return counts;
}

/**
 * Narrows full status counts to the testable scope and rejects empty audits.
 * @param {object} counts Full six-status counts.
 * @returns {object} Status counts and the number of testable mutants.
 */
function toAuditSummary(counts) {
  /** Ignore compile failures and intentional static exclusions when assessing executed scope. */
  const eligible = counts.Killed + counts.Survived + counts.NoCoverage + counts.Timeout;
  if (eligible === 0) throw new Error('No testable mutants in the audit report.');
  return { eligible, ...counts };
}

/**
 * Rejects empty/incomplete reports and counts only statuses from completed executions.
 * @param {object} report Parsed Stryker JSON.
 * @returns {object} Status counts and the number of testable mutants.
 */
export function summarizeMutationAudit(report) {
  return toAuditSummary(countAuditStatuses(readAuditableFiles(report)));
}

/** Whether this module is invoked as the report-validation CLI. */
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    /** Complete raw report, never a numeric score standing in for an execution. */
    const report = JSON.parse(readFileSync('reports/mutation/audit.json', 'utf8'));
    /** Counts retained even when survivors make the retrospective audit red. */
    const summary = summarizeMutationAudit(report);
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.Survived + summary.NoCoverage > 0 ? 1 : 0;
  } catch (error) {
    console.error('mutation-audit:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
