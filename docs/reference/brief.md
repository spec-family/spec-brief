# The brief

A brief is a Markdown file in the briefs directory: front matter that says where the round stands and what it may write, a title, and the sections the repository requires. This page is what spec-brief reads in one. Which sections a repository requires, and the words it uses, are [configuration](configuration.md); what `lint` reports is under [rules](rules.md).

## A brief

```markdown
---
status: active
wave: 2
dependsOn: [007]
affectedFiles: [src/auth/**, tests/auth/**]
protectedFiles: [src/db/schema.ts]
---

# 012 - Rotate session tokens on privilege change

## Intent

Every privilege change issues a new session token and invalidates the old one.

## Negative Scope

- No change to the login UI or the token format.

## Invariants

- [ ] `npm test` passes
- [ ] a rotated token is rejected by every endpoint
```

Work put off for later is a brief too, with `status: deferred` and a `trigger` naming the event that brings it back - "when the second tenant signs", "when p95 exceeds 200 ms", never a date: not `Q3`, not `2026-10`. A deferred brief stays in the briefs directory, is never ready, and runs in no wave until someone sets it `active`.

- The id comes from the file name (`012_rotate-session-tokens.md`) or from an `id` field.
- `affectedFiles` is the scope the round may write.
- `protectedFiles` is what it is not empowered to change, and archival refuses a round that changed it.
- Protection wins: what a round may write is `affectedFiles` less `protectedFiles`, so "all of `src/` but the schema" is `affectedFiles: [src/**]` with `protectedFiles: [src/db/schema.ts]`.

## Claims a round raises, rows it waits on

A brief may name the claims its round raises and the register rows it waits on, each as `path#name`, the path from the repository root:

```markdown
---
status: active
raises: [spec/refunds.md#refund-limit]
awaits: [docs/decisions.md#refund-currency]
---
```

- **`raises`** names a claim: a list item in a specification that opens with a label as code, such as `` `Specified` `` or `` `Implemented` ``, with `<!-- @spec-item id="refund-limit" -->` above it - the claim spec-guard's `claims` holds to its evidence and spec-graph reads. `lint` fails one that is not there, and `archive` refuses the round while a claim it raises carries a label that says the work is still open (`claim-not-raised`). Whether the evidence holds is spec-guard's to say, in the same CI run: no tool calls another.
- **`awaits`** names a register row by its key: the row of a table with a key column, such as `ID` or `Key`, and a status column after it. `lint` fails an active brief while the row is not settled, and warns of it on a draft or on deferred work, whose round has not started.
- What the words mean is configuration: `claims.labels` gives each label `"done"` or `"open"`, and `registers.settled` lists the statuses that settle a row. A brief that names neither field is read as before.

```json
{
  "claims": { "labels": { "Implemented": "done", "Specified": "open" } },
  "registers": { "settled": ["decided", "done"] }
}
```

spec-graph reads the same rows by the same word, so name in `registers.settled` words it reads as settled too ([ADR-0012](https://github.com/spec-family/spec-brief/blob/main/docs/adr/0012-a-brief-names-the-claims-it-raises.md#amended-2026-11-11-the-row-as-spec-graph-reads-it)):

- **In a register spec-graph's configuration names**, a word of that register's `statuses`: spec-graph fails a row whose status is any other, as `unknown-register-status` ([registers](https://github.com/spec-family/spec-graph/blob/main/docs/reference/registers.md)). The word need not be one with `closes`, which says no work is left on the row: a round starts on a `decided` row whose work is the round's own, and `done` closes it once the round is through.
- **In a register it does not name**, each row is a specification, and a word its [lifecycle table](https://github.com/spec-family/spec-graph/blob/main/docs/reference/lifecycle.md) reads as `active` or `frozen`, such as `done`, `accepted` or `approved`, and `decided`, `settled` or `resolved` from the spec-graph release after 0.24.1. A word the table reads as `retired`, such as `closed`, or does not know, leaves the row retired or its phase unknown there, though it settles the row here.

spec-brief checks neither: the vocabulary is spec-graph's and moves with it, and a copy here would be what disagrees.

## Scope patterns

Scopes are globs in spec-core's `path` dialect, the one every spec-\* tool reads: `*`, `?`, `[a-z]` and `{a,b}` within a name, `**` for any number of directories, compared case-sensitively on every host. The rules:

- `**` is a whole segment: `docs/**.md` is refused, since tools read it three ways - write `docs/**/*.md` for any depth, or `docs/*.md` for one level.
- Parentheses are literal, `C++(notes).md`, unless a group holds a `|`: an extended glob such as `+(a|b)` is refused, and written `{a,b}`.
- A trailing `/**` or `/` is a directory's contents - at least one name below it, never the directory itself - on a brace alternative as on the whole pattern: `{src/,lib}` is `src/` or `lib`.
- Each alternative names a path under the root, as a whole pattern does: `./` is refused, and so is `{./,src}`.
- A pattern is relative to the repository root, so a leading `/` is refused, on an alternative as on the whole pattern: `/docs` and `{/docs,src}` alike. A leading `./` takes the slashes after it along, as POSIX reads them: `.//docs` is `docs`, and `./{/docs,src}` is `docs` or `src`.
- After a name, a `/` inside braces names nothing: `docs/{/a,b}` is `docs/a` or `docs/b`.
- A path with no glob syntax is read from the tree: a file the tree holds is that file, a directory it holds is everything beneath it, and a path it does not hold yet is a file unless it ends in `/`.
- Write `src/newmod/` for a directory the round creates; `lint` notes a bare `src/newmod` it cannot place.

## How a brief is read

A brief is read as CommonMark reads it wherever that decides what is code or a comment - fenced and indented code, `<pre>`, `<script>`, `<style>` and `<textarea>` blocks, code spans, HTML comments - and nothing inside those is structure.

- **A section**, and the title, is an ATX heading, `## Name`, outside a block quote: prose over a `---` line is prose and a rule, and a heading quoted from another document is not one of the brief's sections.
- **Section names** compare without case, typographic quotes, emphasis, a leading number or a trailing colon, and a heading may add a qualifier after a separator: `## 2. Commander’s Intent:` fills `Commander's Intent`, and `## Invariants (must hold)` fills `Invariants`.
- **A task** is a list item outside a block quote with `[ ]`, `[x]` or `[X]`.
- **The links archival rewrites** are the ones that write a destination: `[text](dest)`, `![alt](dest)` - one inside a link's text too - and a definition, `[label]: dest`, through which a reference is rewritten once. A definition is one where CommonMark reads it, opening a paragraph or under another: the shape of one under a paragraph's text, or in alt text, is text and stays as written.
