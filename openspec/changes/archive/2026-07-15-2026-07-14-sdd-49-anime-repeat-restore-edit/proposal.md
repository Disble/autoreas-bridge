# Proposal - sdd-49-anime-repeat-restore-edit

## Intent

Complete the Create and Repeat/Restore Update slices for anime CRUD. Every read
or write of Legacy's `animes.dat` MUST cross one anti-corruption gateway. Bridge
creates must render correctly in Legacy without inventing metadata, and Bridge
Repeat/Restore writes must reject stale explicit bases without silently
overwriting newer state.

## Problem

Bridge-created records omit Legacy metadata and render incorrectly. At the same
time, `LegacyAnimeRaw` and its Spanish vocabulary leak into services, so several
modules can construct full Legacy documents. Production OCC is staged in
observe-only mode, which is compatible with base-less older clients but is not
safe for the new base-aware Bridge actions. Finally, SDD-50 cannot implement a
reliable three-way merge unless this change returns version tokens and retains
queryable pre-write state.

## Capabilities

Five capability names below do not exist under `openspec/specs/`; one existing
capability is modified explicitly.

### New Capabilities

- `anime-create-canonical`
- `anime-update-repeat-restore`
- `catalog-lists-all`
- `legacy-gateway`
- `sdd-50-conflict-seams`

### Modified Capabilities

- `sync-conflicts` - modifies the base-less compatibility rule in
  `openspec/specs/sync-conflicts/detection.md` while preserving enforced OCC for
  explicit-base Bridge Repeat/Restore.

## Binding scope

This change MUST deliver all of the following together:

- canonical Create with authoritative metadata enrichment;
- register-first, fail-closed Bridge-native ownership for every canonical Create;
- the exclusive three-layer Legacy gateway;
- Repeat and Restore domain operations, Wails contracts, and AnimeDetail UI;
- the active-and-inactive Catalog regression guard;
- strict OCC for base-aware Bridge writes and the durable seams required by
  SDD-50.
- the temporary, explicit `sync-conflicts` delta for base-less legacy/mobile
  observe-only compatibility.

No item above may move to a sibling or follow-up change. A general multi-field
editor, Delete, and read-focused redesign remain out of scope. SDD-50 owns only
merge/resolution logic and conflict-resolution UI; it does not repair these
foundations.

## Canonical compatibility rules

Structural processing fields (`_id`, `nombre`, `nrocapvisto`, `estado`,
`activo`, `primeravez`, `fechaCreacion`, `dias`, and `pagina`) are required.
`totalcap` and `duracion` MUST be serialized but MAY be JSON null when no
authoritative value exists. `portada` MUST use Legacy's object shape; the
unavailable sentinel is `{ "type": "url", "path": "" }`. The latest aired
episode MUST NOT be used as the announced total.

Updates load the original raw envelope and merge only gateway-owned changed
fields back into it. Unknown fields and nullable metadata are preserved; an old
record is not rejected merely because optional metadata is null.

Canonical Create MUST register its id as Bridge-native before the Legacy append.
Registration failure is fail-closed: return an error and perform no append. This
preserves SDD-48's ownership contract and prevents written-but-unregistered
records from being soft-deleted by reconcile.

## Write outcomes

Create returns its id and current `modified_at`. Repeat/Restore return the
current token plus an explicit `applied`, `no_op`, or `conflict` outcome. The
new UI always sends its displayed token. A stale explicit base records a
conflict, returns `conflict`, and performs no Legacy write; AnimeDetail refetches
and informs the user. Base-less legacy/mobile callers retain the staged
observe-only compatibility path until their contracts are migrated.

## Risks and rollback

- Legacy can still rewrite the file wholesale; that dual-writer problem remains
  outside this change.
- Metadata scraping may be unavailable. Null is safer than a fabricated total,
  and the documented cover sentinel keeps the record renderable.
- Boundary extraction can regress round trips. Real `animes.dat` fixtures and
  differential tests against the current parser/writer are mandatory.
- Rollback restores the prior service wiring and architecture gate together;
  additive write-base rows may remain inert. Never roll back only the gateway
  enforcement while leaving callers split across two write paths.

## Constraints

Strict TDD applies. Frontend feature `.tsx` files remain dumb HeroUI/Tailwind
views; behavior stays in colocated hooks/helpers. Code and UI copy are English;
Spanish identifiers and literals are confined to the Legacy wire layer.
