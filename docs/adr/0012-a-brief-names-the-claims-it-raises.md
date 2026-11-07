---
status: accepted
date: 2026-11-08
---

# ADR-0012: A brief names the claims it raises and the rows it waits on

## Context

A round is planned in a brief and done when its invariants hold, but what it
changes about the specification lives elsewhere. A specification marks each
claim with a label - `Specified`, then `Implemented` once the code and its
evidence are in - and spec-guard's `claims` checks that a claim's label has
the evidence it asks for (spec-guard ADR-0020). Nothing tied the two: a round
could be archived with the claim it was for still `Specified`, and the brief
said nothing of which claims it was for.

A round may also wait on a decision. A repository that keeps its open
questions in a register - a table with a key per row and a status, `open`,
`proposed`, `decided` - starts the round that depends on one only once that
row is settled. Nothing held the brief to it: `dependsOn` names other briefs,
and a question in a register is not a brief.

spec-graph already names both. A claim is a list item a `@spec-item id`
names, and a register row is named by its key (spec-graph ADR-0024 and
ADR-0027). Both readings are spec-core's now, so spec-brief reads the same
documents the same way.

## Decision

**Two front-matter fields, `raises` and `awaits`, each a list of
`path#name`.** The path is from the repository root, as a scope pattern is;
the name is everything after the last `#`.

- `raises: [spec/refunds.md#refund-limit]` names the claim the round raises:
  the list item in `spec/refunds.md` that opens with a configured label and
  carries `<!-- @spec-item id="refund-limit" -->` above it.
- `awaits: [docs/decisions.md#refund-currency]` names the register row the
  round waits on: the row keyed `refund-currency` in a table of
  `docs/decisions.md` with a key column and a status column after it.

**What the words mean is configuration** (ADR-0003). `claims.labels` gives
each label `"done"` or `"open"`, as spec-guard's and spec-graph's
configuration name the labels; `registers.settled` lists the statuses that
settle a row, compared without case by the word a status opens with, as
spec-graph reads a register's status. Neither has a default word: a
repository's labels and statuses are its own.

**`lint` holds a live brief to what it names**, by two rules, error by
default:

- `raises`: each entry is `path#name`, inside the repository, a file there,
  and a claim in it by that name. A draft gets what is not there yet as a
  warning, as it gets its unwritten sections.
- `awaits`: each entry is a row a register in the document keys, and its
  status is one `registers.settled` names. A round that has not started - a
  draft, or deferred work - gets an unsettled row as a warning; an active
  brief gets it as an error, since its round has started on a question still
  open.

A brief that names either with nothing configured to read it by gets one
finding saying which key to set, not one per entry.

**`archive` refuses a round whose claim is not raised** (`claim-not-raised`):
the claim is there and its label is one `claims.labels` calls `"open"`. A
claim that is not there is the `raises` rule's error, which refuses the
archival as any error on the brief does, and is not reported twice.

**The label, not the evidence.** Whether an `Implemented` claim has a test
behind it is spec-guard's `claims` check, which reads the code. spec-brief
reads the label alone, and the CI run that archives the round runs both. No
tool calls another: each is installed, pinned and trusted on its own, and a
check one tool made by starting another would be one neither tool's
configuration describes.

## Alternatives

- **Naming claims in the invariants**, a task item per claim. The invariants
  are prose a reviewer ticks; a claim named there would have to be found in
  text, and a tick says a person checked, not that the label moved.
- **Reading evidence here.** spec-brief would need spec-guard's directive
  grammar and engine, and two tools would answer the same question, perhaps
  differently.
- **Naming a claim by its text.** Text changes as a claim is refined; the
  `@spec-item id` stays, which is why spec-graph pairs claims by it across
  states.
- **Default labels and statuses.** `Implemented` and `decided` are common,
  not universal; a default would read another repository's words wrongly and
  report clean.

## Consequences

- A brief that names neither field is read and checked as before, and so is
  a repository that configures neither key.
- The documents named are read only for the live briefs that name them, each
  once a run, and scanned by spec-core's Markdown reader in time linear in
  their length.
- An archived brief's `raises` and `awaits` are a record, not a check: the
  freeze keeps them as they were when the round closed.
