# Rules

What `lint`, `matrix`, `schedule` and `archive` report, by rule, with the severity each has unless the configuration's `rules` sets another: `off`, `note`, `warning` or `error`. A plugin's rules run beside these as `<name>/<rule>` ([plugins](plugins.md)).

<!-- rules:start -->
| Rule | Default | Reports |
| --- | --- | --- |
| `front-matter` | error | Front matter that does not parse, a duplicate key, YAML beyond the flat subset, TOML. |
| `field` | error | A field spec-brief reads with a value of the wrong shape: a wave that is not a whole number, a list where one value belongs. |
| `unknown-field` | warning | A front-matter key nobody declared, with the one probably meant. |
| `status` | error | No status, a word the configuration does not use, or a status that disagrees with the directory. |
| `id` | error | No id, or one with whitespace or a slash. |
| `duplicate-id` | error | Two briefs, live or archived, with one id. |
| `title` | warning | A live brief with no title. |
| `unknown-type` | error | A type the configuration does not define. |
| `missing-section` | error | A required section that is absent. |
| `duplicate-section` | warning | A section that appears twice. |
| `empty-section` | error | A section with no content; a comment is not content. A warning in a draft. |
| `placeholder` | error | A section holding only `TBD`, `TODO` or an empty box. A warning in a draft. |
| `missing-checklist` | error | A checklist section with no task item. A warning in a draft. |
| `must-contain` | error | A section without the text the configuration requires of it. |
| `section-order` | error | Sections out of the configured order, when one is configured. |
| `dependency` | error | A dependency on itself, or on a brief that does not exist. |
| `dependency-cycle` | error | Live briefs that depend on each other in a cycle, reported once, as a path. |
| `wave-order` | error | A live dependency that does not run in an earlier wave. |
| `deferral-trigger` | error | A deferred brief with no `trigger`, or one that is only a date or a time - `2026-10`, `Q3`, `next month`, `October` - or a placeholder, rather than an event such as "when the second tenant signs". The words for a time are English. |
| `raises` | error | A claim in `raises` that is not `path#name`, names a document that is not a file, or names no claim there: a list item opening with a configured label, under `<!-- @spec-item id="..." -->`. Claims raised with no labels configured. A warning in a draft. |
| `awaits` | error | A row in `awaits` that is not `path#key`, or that no register in the document keys. A row whose status is not one of `registers.settled`, a warning in a draft or deferred work. Rows awaited with no settled statuses configured. |
| `glob` | error | A scope pattern spec-brief cannot read. |
| `scope-contradiction` | error | Patterns in `affectedFiles` that `protectedFiles` cover entirely, so nothing of them is writable - one finding per brief, naming each. A pattern the search cannot decide is a warning. |
| `glob-matches-nothing` | note | A scope pattern that matches no file git sees, tracked or untracked - expected when the round creates it. |
| `literal-read-as-file` | note | A path with no glob syntax that the tree does not hold and whose name has no extension, such as `src/newmod`: read as a file, and `src/newmod/` if a directory was meant. Inside braces the advice is the pattern written with the `/` added, `lib/{util,new/}`, or the alternative in an entry of its own, `lib/new/`. |
| `archive-freeze` | error | An archived brief that changed after it was archived. |
| `collision` | error | Two briefs in one wave whose scopes can name the same file (`matrix`). |
| `collision-undecided` | warning | Two briefs in one wave whose collision the search could not decide within its budget and no file of the tree proves (`matrix`), or a wave `schedule` passed over for it. |
| `unscoped` | note | A brief sharing a wave that declares no scope (`matrix`), or one `schedule` runs alone. |
| `shared-directory` | off | Two briefs in one wave writing into the same directory (`matrix`). |
| `wave-schedule` | error | A brief with no wave, or a declared wave that does not hold - a collision in it, a dependency out of order - with the wave `schedule` computes and why (`schedule`). A declared wave that holds and is not the computed one is a note. |
| `scope-unmeasured` | warning | A brief with a scope archived without the files its round changed, so nothing checked the scope (`archive`). |
| `stale-link` | warning | Links in live briefs left pointing where a brief used to be, when `archiving.rewriteLinks` is off (`archive`, `unarchive`). |
<!-- rules:end -->

`archive` refuses with its own reasons - `open-task`, `archive-draft`, `archive-deferred`, `dependency-open`, `claim-not-raised`, `dirty-tree`, `protected-file`, `out-of-scope`, `archive-exists` - and says `waived` and `waiver-ignored` of what [plugins](plugins.md#waiving-a-refusal) lift; none of these are lint rules: they are about whether this round is done, not whether the brief is well written. The rules marked `archive` above are raised by archival too, and configuration sets their severity like any other.
