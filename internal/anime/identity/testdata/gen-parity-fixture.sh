#!/usr/bin/env sh
# Regenerates expected-decisions.json from the TypeScript prototype.
#
# Usage, from the repository root:
#   internal/anime/identity/testdata/gen-parity-fixture.sh [prototype-root]
#
# The prototype root defaults to ./tools/episode-triage-poc. Note that the
# prototype is UNTRACKED, so a fresh worktree does not contain it; in that case
# pass the path of the main worktree's copy, for example
#   /d/dev/disble/autoreas-sp/autoreas-bridge/tools/episode-triage-poc
#
# The stamped generatedBy value is a constant naming this script, deliberately
# NOT the command that produced the file: a command that embeds its own output
# cannot reproduce itself, and the earlier recipe failed for exactly that
# reason. Re-running this script is byte-identical by construction.
set -eu

PROTO=${1:-./tools/episode-triage-poc}
OUT=internal/anime/identity/testdata/expected-decisions.json
GEN="internal/anime/identity/testdata/gen-parity-fixture.sh <prototype root as the first argument>"

if [ ! -f "$PROTO/analyze.ts" ]; then
	echo "gen-parity-fixture: no analyze.ts under $PROTO" >&2
	exit 1
fi

STAGE1='import("./analyze.ts").then(async ({analyze}) => { const splits = {}; for (const s of ["dev", "supplemental"]) { const c = await Bun.file("artifacts/interview-eval-" + s + ".json").json(); splits[s] = c.cases.map((c) => { const n = analyze(c.snapshot, c.id).nextSelection; return {id: c.id, episode: n ? n.episode : null, basename: n ? n.basename : null}; }); } console.log(JSON.stringify({splits})); });'
STAGE2='const t = await Bun.stdin.text(); const s = JSON.parse(t); console.log(JSON.stringify({generatedBy: process.env.GEN, splits: s.splits}, null, 2));'

bun --cwd="$PROTO" -e "$STAGE1" | GEN="$GEN" bun -e "$STAGE2" > "$OUT"

echo "gen-parity-fixture: wrote $OUT"
