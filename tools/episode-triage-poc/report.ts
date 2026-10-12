/** PROTOTYPE — disposable, NOT PRODUCTION. Standalone offline HTML report shell. */
import type { Snapshot, TriageResult } from "./types.ts";

export interface ReportBlock {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly snapshot: Snapshot;
  readonly result: TriageResult;
}

const RULE_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["Watched-first", "Integer app progress marks ordinals at or below it as already-watched context; numbered format alone never means watched."],
  ["Direct number", "A clear single pending ordinal identifies the file with no global collection gate; date inversions, ties, and gaps stay diagnostics, never vetoes."],
  ["Elimination", "Watched 12 plus one clear 14 plus one unnumbered pending file infers the other as 13 conditionally, under a visible consecutive-pending hypothesis. A sole opaque pending file with a complete watched 1..progress prefix likewise claims the usable next conditionally under a consecutive-watched-prefix hypothesis; gaps, duplicates, expectedNext contradictions, and lone files without watched context abstain."],
  ["Pending chronology", "With no usable numbers, earlier pending creation plus agreeing modification order takes the usable next conditionally; watched rows never take part. Ties, unknowns, and inversions abstain."],
  ["R1 label grammar", "Conservative token/marker/delimited-suffix candidates; title stems never required to match. Name and explicit-tag ordinals tracked separately."],
  ["R2 order intervals", "Partial-order rank intervals widened by every unknown (missing or unreliable) entry; missing stays missing. Lexical order is display-only."],
  ["R3 convention use", "Absolute rank=>episode ONLY under a declared complete-prefix/from-1/no-gaps/no-extras convention; it refines verdicts but never gates pending-first decisions."],
  ["R3b validity gate", "Changed or error-carrying captures stay visible but accept nothing and rank nobody; healthy files are never vetoed by one bad entry."],
  ["R4 joint corroboration", "Under a declared convention, single label ordinal == unique creation rank (+compatible mtime, no recreation) => corroborated."],
  ["R4b joint conflict", "Under a declared convention, label != creation rank => conflicting with both alternatives; no silent swap."],
  ["R4c tied creation", "Under a declared convention, tied/missing/widened creation + exact mtime/label => conditional, assumption named."],
  ["R4d timeline agreement", "Under a declared convention, unique creation rank != unique modification rank (no recreation explanation) => conflicting; no silent chrono override."],
  ["R5 recreation", "Birth later than retained mtime + mtime/label agree => conditional with the creation disagreement kept visible."],
  ["R5b opaque rank+context", "Under a declared convention, unlabeled file + unique rank == usable next => conditional; still reconciled globally."],
  ["R5c competing claims", "Filename ordinal vs differing explicit tag => conflicting with all alternatives; multiple claims never reduce to absent."],
  ["R6 ambiguity", "Fractional/range/multi/special/total-hint without a clean single ordinal => ambiguous, never collapsed to a trailing integer."],
  ["R7 duplicates", "Two files sharing one ordinal => both conflicting; no shared ordinary assignment."],
  ["Next selection", "Actual next is selected AFTER reconciliation, only at the usable next ordinal (explicit integer expected-next, else exact integer progress+1; fractional never truncates). It must name a published, stable, known file; otherwise selection abstains with a visible reason. A supplied expectedNext that is not a usable positive integer carries no ordinal: derivation stays on exact integer progress+1 while the reason and the selected file disclose that the token was not used."],
  ["R9 global reconcile", "Proposals group by episode before anything publishes; contested episodes suspend every claimant, corroborated and conditional alike."],
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Build one standalone offline HTML file embedding data + SAME-algorithm bundle. */
export function buildReport(
  title: string,
  question: string,
  blocks: readonly ReportBlock[],
  coreBundleJs: string,
): string {
  const data = JSON.stringify(blocks.map((b) => ({ ...b })));
  const tabs = blocks.map((b, i) =>
    `<button class="tab" data-i="${i}" role="tab" aria-selected="${i === 0}">${esc(b.id)} — ${esc(b.title)}</button>`,
  ).join("\n");
  const rules = RULE_ROWS.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — PROTOTYPE, NOT PRODUCTION</title>
<style>
body{font-family:system-ui,sans-serif;max-width:72rem;margin:0 auto;padding:1.5rem;line-height:1.45}
.banner{background:#fff3cd;border:1px solid #d8a800;padding:.75rem 1rem;border-radius:.5rem;font-weight:600}
.nextsel{background:#d3f9d8;border:2px solid #2b8a3e;padding:.75rem 1rem;border-radius:.5rem;margin:.75rem 0;font-size:1.05rem}
.nonext{background:#e9ecef;border:2px solid #666;padding:.75rem 1rem;border-radius:.5rem;margin:.75rem 0;font-size:1.05rem}
.state{background:#f6f6f6;border:1px solid #ccc;padding:.75rem 1rem;border-radius:.5rem;margin:.75rem 0}
table{border-collapse:collapse;width:100%;margin:.5rem 0}td,th{border:1px solid #bbb;padding:.35rem .5rem;text-align:left;font-size:.85rem}
.tabs{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0}.tab{border:1px solid #666;background:#eee;padding:.4rem .7rem;border-radius:.4rem;cursor:pointer}
.tab[aria-selected="true"]{background:#0b5fff;color:#fff;border-color:#0b5fff}
.controls{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0}
.controls button{padding:.4rem .7rem;border-radius:.4rem;border:1px solid #666;background:#fff;cursor:pointer}
details{margin:.4rem 0}.pill{display:inline-block;padding:.05rem .5rem;border-radius:1rem;font-size:.75rem;font-weight:700}
.corroborated{background:#d3f9d8}.conditional{background:#fff3bf}.conflicting{background:#ffc9c9}.ambiguous{background:#e5dbff}.unresolved{background:#e9ecef}
</style></head><body>
<div class="banner">PROTOTYPE — disposable episode-recognition triage, NOT PRODUCTION. No AI. Deterministic rules only.</div>
<h1>${esc(title)}</h1>
<p><b>Question this demo answers:</b> ${esc(question)}</p>
<h2>Exact practical rule table</h2>
<table><tr><th>Rule</th><th>Decision</th></tr>${rules}</table>
<h2>Guided cases</h2>
<div class="tabs" role="tablist">${tabs}</div>
<div id="case"></div>
<h2>Free-play controls (in-memory, same bundled algorithm)</h2>
<div class="controls">
<button id="ctl-mask">Mask pending names</button>
<button id="ctl-tie">Tie dates</button>
<button id="ctl-recreate">Recreate one timestamp</button>
<button id="ctl-restore">Restore original</button>
</div>
<div id="freeplay" class="state"></div>
<script>${coreBundleJs}</script>
<script>var REPORT_DATA = ${data};</script>
<script>
var idx = 0, working = null;
function pill(v){ return '<span class="pill '+v+'">'+v+'</span>'; }
function row(v){
  return '<tr><td>'+v.basename+'</td><td>'+pill(v.verdict)+'</td><td>'+(v.episode??'')+'</td>'+
  '<td>'+(v.alternatives||[]).join(',')+'</td><td>'+v.birthRank+' / '+v.mtimeRank+'</td>'+
  '<td><details><summary>evidence</summary><b>support</b><ul>'+v.support.map(function(s){return '<li>'+s+'</li>'}).join('')+'</ul>'+
  '<b>contradictions</b><ul>'+v.contradictions.map(function(s){return '<li>'+s+'</li>'}).join('')+'</ul>'+
  '<b>assumptions</b><ul>'+v.assumptions.map(function(s){return '<li>'+s+'</li>'}).join('')+'</ul></details></td></tr>';
}
function intProgress(snap){
  var p = snap.context ? snap.context.progress : undefined;
  return (typeof p === 'number' && Number.isInteger(p) && p >= 0) ? p : null;
}
function singleOrdinal(basename){
  var claims = TriageCore.parseLabel(basename).claims.filter(function(c){ return c.kind === 'ordinal'; });
  var eps = [];
  claims.forEach(function(c){ (c.episodes||[]).forEach(function(e){ eps.push(e); }); });
  var uniq = Array.from(new Set(eps));
  return uniq.length === 1 ? uniq[0] : null;
}
function isWatchedEntry(e, prog){
  if (prog === null) return false;
  var o = singleOrdinal(e.basename);
  return o !== null && o <= prog;
}
function nextBanner(res){
  if (res.nextSelection) {
    return '<div class="nextsel" id="nextsel"><b>Actual next: episode '+res.nextSelection.episode+
      ' — '+res.nextSelection.basename+'</b><br>'+res.nextReason+'</div>';
  }
  return '<div class="nonext" id="nextsel"><b>No next selection.</b> '+res.nextReason+'</div>';
}
function partitionHtml(snap, res){
  var prog = intProgress(snap);
  var byBase = {};
  Object.keys(res.assignments).forEach(function(ep){ byBase[res.assignments[ep]] = ep; });
  var watched = [], pending = [];
  res.verdicts.forEach(function(v){
    var ep = (v.episode !== undefined && v.episode !== null) ? v.episode : byBase[v.basename];
    if (ep !== undefined && prog !== null && ep <= prog) watched.push(v.basename + ' (ep' + ep + ')');
    else pending.push(v.basename);
  });
  return '<div class="state"><b>App progress:</b> '+(prog === null ? 'unknown (nothing marked watched)' : prog)+
    ' &nbsp; <b>Watched ('+watched.length+'):</b> '+(watched.join(', ') || '—')+
    '<br><b>Pending ('+pending.length+'):</b> '+(pending.join(', ') || '—')+'</div>';
}
function render(){
  var b = REPORT_DATA[idx];
  var snap = working || b.snapshot;
  var res = (working ? TriageCore.analyze(snap, b.id) : b.result);
  document.getElementById('case').innerHTML =
    '<h3>'+b.id+' — '+b.title+'</h3><p>'+b.description+'</p>'+
    nextBanner(res)+partitionHtml(snap, res)+
    '<div class="state"><b>Convention:</b> '+(snap.convention?snap.convention.label:'unknown')+
    ' &nbsp; <b>Context:</b> '+JSON.stringify(snap.context||{})+
    ' &nbsp; <b>Entries:</b> '+snap.entries.length+'</div>'+
    '<table><tr><th>file</th><th>verdict</th><th>ep</th><th>alternatives</th><th>ranks birth/mtime</th><th>evidence</th></tr>'+
    res.verdicts.map(row).join('')+'</table>'+
    '<div class="state"><b>assignments</b> '+JSON.stringify(res.assignments)+
    '<br><b>pending</b><ul>'+res.pendingCompatibility.map(function(s){return '<li>'+s+'</li>'}).join('')+'</ul>'+
    '<b>global notes</b><ul>'+res.globalNotes.map(function(s){return '<li>'+s+'</li>'}).join('')+'</ul>'+
    '<b>global assumptions</b><ul>'+res.globalAssumptions.map(function(s){return '<li>'+s+'</li>'}).join('')+'</ul></div>';
  document.getElementById('freeplay').textContent =
    'Recomputed client-side with the SAME bundled analyze() over ' + snap.entries.length + ' entries. ' +
    (working ? 'Modified in-memory copy active.' : 'Showing recorded CLI result.');
}
document.querySelectorAll('.tab').forEach(function(t){
  t.onclick = function(){ idx = +t.dataset.i; working = null;
    document.querySelectorAll('.tab').forEach(function(x){x.setAttribute('aria-selected', x===t?'true':'false')});
    render(); };
});
function clone(){ return JSON.parse(JSON.stringify(REPORT_DATA[idx].snapshot)); }
function alphaName(n){ var s = '', m = n + 1; do { m--; s = String.fromCharCode(97 + (m % 26)) + s; m = Math.floor(m / 26); } while (m > 0); return s; }
function opaqueAlias(n, used){ var a = alphaName(n), guard = 0;
  while (guard++ < 12 && (used[a] || !TriageCore.parseLabel('veiled-'+a+'.mp4').claims.every(function(c){ return c.kind === 'opaque'; }))) { a += 'x'; }
  used[a] = 1; return 'veiled-'+a+'.mp4'; }
document.getElementById('ctl-mask').onclick = function(){
  var s = clone(), used = {}, prog = intProgress(s);
  s.entries.forEach(function(e,i){
    if (isWatchedEntry(e, prog)) return;
    var alias = opaqueAlias(i, used);
    var slash = Math.max(e.path.lastIndexOf('/'), e.path.lastIndexOf(String.fromCharCode(92)));
    e.path = (slash >= 0 ? e.path.slice(0, slash + 1) : '') + alias;
    e.basename = alias; delete e.episodeTags;
  });
  s.notes = 'in-memory: pending names masked to non-numeric opaque aliases; watched anchors preserved'; working = s; render(); };
document.getElementById('ctl-tie').onclick = function(){ var s = clone();
  var b0 = s.entries[0] ? s.entries[0].birthNs : null, m0 = s.entries[0] ? s.entries[0].mtimeNs : null;
  s.entries.forEach(function(e){ e.birthNs = b0; e.mtimeNs = m0; });
  s.notes = 'in-memory: dates tied'; working = s; render(); };
document.getElementById('ctl-recreate').onclick = function(){ var s = clone();
  var last = s.entries[s.entries.length-1];
  if (last && last.birthNs){ var max = s.entries.reduce(function(a,e){ return (e.birthNs && BigInt(e.birthNs) > BigInt(a)) ? e.birthNs : a; }, last.birthNs);
    last.birthNs = (BigInt(max) + 3600000000000n).toString(); }
  s.notes = 'in-memory: last file recreated'; working = s; render(); };
document.getElementById('ctl-restore').onclick = function(){ working = null; render(); };
render();
</script></body></html>`;
}
