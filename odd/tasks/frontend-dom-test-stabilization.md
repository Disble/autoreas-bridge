# Frontend DOM test stabilization

## Authorization and limits
Authorized: a bounded, test-only redesign after primary-source research.
Forbidden: production/configuration/worker/timeout/threshold changes, wholesale UI mocks, suppressions, commits, publishing, or recovery-stash deletion.
Budget consumed: one implementation round and one independent verification. No repair or verification retry.

## Tasks
- [x] 1. Research and scope the redesign. Explorer mv6336f9-5-0y7r and primary sources below; unsupported contention causality and arbitrary settling-count replacement rejected.
- [x] 2. Complete one bounded test-only round. Writer mv63kdi9-6-slxe; two test files changed, shared helper unchanged. All 26 focused behaviors retained; ESLint and typecheck passed; representative paired fault rejection retained and probes restored.
- [x] 3. Independently verify retained guarantees and run the exact full gate once. Verifier mv641cvd-8-t3tv: PASS, exit 0, all 12 jobs and both real-browser smokes. Closure is the bounded work outcome, not proof of permanent flake elimination.

## Changed test surfaces
- `frontend/src/features/history/ui/HistoryFilterBar/__tests__/HistoryFilterBar.test.tsx`: accessible range-trigger lookup; original CSS lookup was already container-scoped. Calendar-day global queries and exact-once complete date payload assertions remain unchanged.
- `frontend/src/features/network/ui/TransactionPanel/__tests__/TransactionPanel.windowing.test.tsx`: observable row/selection waits, wrapped clicks with explicit null guards, bounded asynchronous debounce advancement, and improved cleanup.
- Shared `transaction-panel.test-helpers.ts` unchanged.

All 26 behaviors remain: real HeroUI/calendar/virtualizer/store; loaded 150/mounted ≤100; literal row height 36/overscan 5; exact spacers/colspan 6; paging boundary; debounce/filter/cursor reset; push offset, reading position and selection; in-place updates; unmounted selection; cursorless/unattended guards. Negative-polling helpers remain intentionally. File sizes: 181/383 physical lines, 127/223 effective; helper 156.

## Baseline and writer evidence
Before redesign, identical source/configuration produced a full-gate timeout failure and then a full-gate pass. Five focused runs passed 130/130. This establishes observed nondeterminism, not its cause.
Writer normal runs passed 26/26; baseline/after/restored wall times 33.28/6.73/5.55 seconds are not a comparable resource benchmark.
No meaningful deterministic behavior RED exists for this test-only refactor; no invented TDD lifecycle or native mutation-score claim.

Two fault types produced three paired before/after assertion failures:
1. `formatHistoryRangeLabel → FAULT-LABEL`: wrong displayed label, not date-payload emission.
2. Row estimate `36 → 40`: wrong spacer (5920 versus 5400) and prepend offset (840 versus 836).
The selected probe run failed the same three assertions before and after, for intended values rather than setup errors or timeouts; all temporary mocks were restored. This does not prove every payload or DOM-ceiling mutant is detected.
Original probe logs were not retained: `.pi/artifacts/test-redesign-evidence.md` is a transcript-recovered receipt, not original raw output.

## Independent verification
Command, run exactly once:
```bash
lefthook run pre-merge-commit --no-auto-install
```
Exit 0; wall 225.506 seconds; hook 224.03 seconds. Log: `.pi/artifacts/test-redesign-final-gate.log`.
- Frontend: 368 files, 3696/3696 tests; Vitest 180.56 seconds (lines 120–123).
- Go: 58 packages passed, 56 cached; both lint profiles report zero issues.
- All 12 leaf jobs passed (lines 511–528).
- Production render and 366 real-browser layout assertions passed at 1280×900 and 1600×1000.
- The original three flaky cases passed as part of the complete suite; compact reporter provides no per-case timing.
- Tests/helper/locks and tracked diff hashes matched before/after execution; tracked-diff SHA256: `4a92bd3c9ff37f05dc393e93ccfca56205a8ceece301d7ea01bc9aea53d119e5`.
- Index empty, unmerged entries zero, mirrors equal, no fault/conflict remnants. HEAD/dev `7d37c786`; recovery stash `ccc49a483186cbe1e996c732579333ed0198ceee` retained.
- No verifier edits, retries, installs, staging, or delivery.

After verification, parent updated task/artifact/Engram records and appended one documentation-only lesson in `docs/learning-log.md`. The tracked-diff identity above applies to the verification interval, before that documented closure update; no test or production source changed after verification.

## Limits and remaining gaps
- No root-cause, permanent-stability, or speedup claim. Calendar-day global queries remain; accessible trigger lookup is not proven cheaper.
- Accessible prefix uses a producer constant; independent display/date/geometry assertions remain. This is a selector coupling limitation, not blanket assertion tautology.
- Spy `finally` protects waits/assertions, but render precedes `try`; render exceptions could still bypass restoration. Nonblocking finding; no second repair round.
- Eight existing Go size warnings and two Node DEP0190 warnings remain.
- Native ASSESS unavailable (`package-local-binary-missing`): conservative high-risk plan required independent verification, now fulfilled. Fresh native CLI reports RDD globally off; no review transaction or installation.
- Fresh Actionlint, hosted Actions execution, and real staged-source quality remain unproved. Earlier native Actionlint validation is historical evidence only.

## Research
- https://testing-library.com/docs/queries/byrole/#performance
- https://testing-library.com/docs/dom-testing-library/api-within/
- https://testing-library.com/docs/dom-testing-library/api-async/
- https://react.dev/reference/react/act
- https://github.com/vitest-dev/vitest/blob/v4.1.6/docs/api/vi.md
- https://github.com/vitest-dev/vitest/blob/v4.1.6/docs/api/hooks.md

## Closure
One round, one independent gate, then stop. No new repair authorized.
Work-unit commit: none, per explicit user constraint.
Risk: item 6 (preserving regression detection when changing tests); independent verification completed.
