# Delta for observability

## ADDED Requirements

### Requirement: Committed Writes Declare Their Changed Fields By Derivation

The system MUST record, for every committed anime write, the set of top-level snapshot
fields whose value differs between the operation's base snapshot and its desired snapshot.
That set MUST be derived inside the same transaction that finalizes the write, from the
snapshot pair the transaction already holds. It MUST NOT depend on any producer passing a
declared field list, because a declared list can be omitted without any failure surfacing.

The derived set MUST travel with the committed change to every downstream consumer that
already carries a changed-field list, so that the changelog reflects what actually changed
rather than an empty envelope.

#### Scenario: A single-field write declares exactly that field

- GIVEN an anime whose stored snapshot has a cover, three scheduled days, and two genres
- WHEN an editor save commits a write that changes only the cover
- THEN the recorded changed-field set contains the cover field
- AND it does not contain the days field or the genres field

#### Scenario: A write that empties a collection declares that collection

- GIVEN an anime whose stored snapshot has three scheduled days
- WHEN a write commits a desired snapshot whose days collection is empty
- THEN the recorded changed-field set contains the days field

#### Scenario: A no-op write declares no fields

- GIVEN an anime with a stored snapshot
- WHEN a write commits a desired snapshot identical to the base snapshot
- THEN the recorded changed-field set is empty
- AND the empty set is recorded as an empty list, never as a null or absent value

#### Scenario: Derivation survives a producer that passes nothing

- GIVEN a publishing service that supplies only the desired payload and no field list
- WHEN its write commits
- THEN the recorded changed-field set is still complete and correct
- AND no code path allows a committed write to record an empty set while fields differ

### Requirement: Silent Collection Truncation Is Detectable

The system MUST provide a repeatable check that identifies committed writes which reduced a
collection-valued snapshot field from non-empty to empty while that field was not part of
the write's intent. The check MUST operate over already-persisted write-operation data and
MUST NOT require new runtime instrumentation.

The check MUST report enough per-row identity for the result to serve directly as a recovery
list: the affected entity, the field, and when the write committed.

#### Scenario: A cover-only save that empties the schedule is reported

- GIVEN a committed write whose base snapshot has a non-empty days collection
- AND whose desired snapshot has an empty days collection
- AND whose changed-field set does not contain the days field
- WHEN the truncation check runs
- THEN that write is reported, naming the entity, the field, and the commit time

#### Scenario: An intentional clear is not reported

- GIVEN a committed write that empties the days collection
- AND whose changed-field set contains the days field
- WHEN the truncation check runs
- THEN that write is not reported

#### Scenario: A clean database reports nothing

- GIVEN no committed write reduced a collection from non-empty to empty outside its intent
- WHEN the truncation check runs
- THEN the check reports no findings and succeeds

### Requirement: Runtime Event Types Come From A Closed Vocabulary

The system MUST expose runtime event types as declared constants rather than free-form
strings written at each call site. Every event type persisted to the runtime event log MUST
come from that declared vocabulary.

A grouping over event type MUST therefore partition events into meaningful buckets, rather
than splitting one logical area across several spellings.

#### Scenario: One logical area has one event type

- GIVEN several components emit runtime events for the same logical area
- WHEN those events are grouped by event type
- THEN that area appears as exactly one bucket
- AND no two spellings of the same area appear as separate buckets

#### Scenario: Emitting an undeclared event type is prevented

- GIVEN a component emits a runtime event with a structured event type
- WHEN that event type is not part of the declared vocabulary
- THEN the code does not compile, or the check that guards the vocabulary fails

### Requirement: Health Rollups Exclude Synthetic Entities

The system MUST distinguish runtime events about real product entities from events emitted
by demonstration or self-test harnesses. Any health rollup, coverage ratio, or dashboard
figure derived from runtime events MUST exclude synthetic entities.

A component MUST NOT derive an event's domain by parsing the text of its own message.

#### Scenario: A tracer-bullet event does not count toward health

- GIVEN the tracer bullet has emitted its demonstration event sequence
- WHEN a health rollup over runtime events is computed
- THEN none of those tracer-bullet events contributes to the rollup

#### Scenario: A domain is declared, not parsed from prose

- GIVEN a component records a message that contains a colon-separated prefix
- WHEN the resulting runtime event is persisted
- THEN its domain is the domain the component declared
- AND the domain is not affected by the message text

### Requirement: Real-Entity Event Coverage Is Measurable

The system MUST make it possible to compute the proportion of committed anime writes that
emitted a corresponding runtime event about the same real entity. The measure MUST be
expressed as a ratio over committed writes, not as an event count, so that synthetic or
transport traffic cannot inflate it.

#### Scenario: A silent write path lowers coverage

- GIVEN committed anime writes exist
- AND one write path commits without emitting a runtime event for its entity
- WHEN real-entity event coverage is computed
- THEN the result is below full coverage

#### Scenario: Synthetic traffic does not raise coverage

- GIVEN a large number of runtime events about synthetic entities exist
- WHEN real-entity event coverage is computed
- THEN the result is unchanged by those events

## MODIFIED Requirements

### Requirement: Domain Runtime Events Are Observable

The system MUST log meaningful runtime events for anime, sync, api, websocket, and system
flows. Each such event MUST carry its declared domain, and events about a product entity
MUST carry that entity's identifier and an event type drawn from the declared vocabulary, so
the event can be located by what happened and to what, rather than only by free-text search
over its message.

#### Scenario: Anime runtime activity is logged

- GIVEN startup catch-up, watcher, or writer activity occurs
- WHEN the component completes an important step or warning path
- THEN the logger MUST record an entry in the `anime` or `system` domain

#### Scenario: Sync and websocket propagation is logged

- GIVEN an `anime.changed` flow reaches sync or websocket boundaries
- WHEN downstream services react
- THEN the logger MUST record the receiving or forwarding action with the relevant domain prefix

#### Scenario: An event about an entity is locatable by that entity

- GIVEN a runtime event is recorded about a specific anime
- WHEN the event log is queried by that anime's identifier
- THEN the event is returned
- AND the event carries an event type from the declared vocabulary
