# Commands

The eight commands, each in full. What every command takes, the exit codes, and what a line is refused for are under [options](options.md).

## `spec-brief init`

Writes `.spec-brief.json` with every default spelled out, and creates the brief and archive directories. `--briefs <dir>` and `--archive <dir>` choose them, and `--root <dir>` the directory to set up, which `init` makes when it is not there. It takes no argument: `init mydir` is [refused](options.md#an-input-that-names-nothing).

## `spec-brief new <title>`

Scaffolds a brief with the next free number - one more than the highest id, live or archived, since ids are never reused - and every required section, each holding its `hint` in a comment. A comment is not content, so a fresh brief reads as unwritten until someone writes it. `--id`, `--type`, `--wave`, `--depends-on 7,8` and `--date` fill the front matter; without `--date` the date is [today's](options.md#todays-date).

## `spec-brief lint [brief...]`

Checks every brief, or the ones named. A draft (`status: draft`) gets its unwritten sections as warnings; an active brief gets them as errors. Archived briefs are frozen records: they are checked for identity and for the freeze, never against today's schema.

`--verbose` has `--format github` annotate the notes too, as `matrix --verbose` and `schedule --verbose` do; every other format writes them without it ([GitHub](formats.md#github)).

```text
briefs/035_the-background-side.md
    5  error    has no "Report" section  missing-section
                add a "## Report" heading
   48  error    "Context" comes before "Standing directives"  section-order
                the order is Mission, Standing directives, Context, Deliverables, ...

2 errors, 0 warnings, 0 notes in 35 brief(s)
```

## `spec-brief list`

Live briefs with their status, in the word the brief writes (`封存` where the configuration names it for archived), wave, task count, readiness and title.

- **The title** is shown without the id it repeats: `new` writes `# 012 — Rotate tokens`, and the table has an id column, so the title shown is `Rotate tokens`. Only the brief's own id comes off, and only before a dash, a colon or a spaced hyphen, so `Fix - the login bug` is shown whole. `schedule` shows titles the same way, and `--format json` gives the title as written.
- **A brief is *ready*** when every brief it depends on is archived, and it is neither a draft nor deferred.

| Option | Shows |
| --- | --- |
| `--ready` | Only the ready briefs, which is the question an orchestrator asks. |
| `--archived` | The archive as well. |
| `--format json` | The whole table, for an orchestrator, the sections the configuration asks for, each with its `hint`, and what the answer was read from. |

**What kept a brief from being read whole.** A field whose value cannot be read is read as empty, so `"protectedFiles": []` says the same of a brief that protects nothing and of one whose protection could not be read. `--format json` gives each brief `problems`, empty for a brief read whole, so a tool that guards writes by the brief can tell the two apart; the pretty table names such briefs beneath it.

```json
"problems": [
  { "rule": "field", "field": "protectedFiles", "line": 5, "message": "\"protectedFiles\" an inline list is never closed; keep it on one line" }
]
```

- **`rule`** is the [rule](rules.md) whose finding it is, worded as `lint` words it, so `spec-brief lint` names the fix: `encoding` (UTF-16, lines ended by a carriage return alone, or a lone CR in the front matter), `front-matter` (a block never closed, TOML, a line that is no key, a duplicate key), `field` (a value of a field spec-brief reads that it cannot read: an inline list never closed, a YAML anchor, an empty item) or `glob` (a scope pattern it cannot read, such as one that starts with `/`).
- **`field`** is the front-matter key it is about, spelt as spec-brief or the configuration spells it, or `null` where it is about the text or the block as a whole: then no field can be taken as read.
- **`line`** is 1-based.
- The rules are asked whatever the configuration sets them to: one turned `off` says nothing in `lint` and still reports here. Nothing else in the row changes meaning: an unreadable list is still `[]`, an unreadable status `null`, and `ready` is what it was.

**What the answer was read from.** `--format json` names, under `inputs`, every input of its answer, so that a tool that asks for the same answer again, as spec-harness does before each write it checks, can give the one it kept while every input reads as listed, without starting spec-brief ([the family contract](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md), amended 2026-10-19):

```json
"inputs": {
  "keep": true,
  "tool": "0.10.0",
  "files": [
    { "path": ".spec-brief.json", "sha256": "ca3d163b..." },
    { "path": "briefs/001_a.md", "sha256": "5ee9361a..." },
    { "path": "spec-brief.json", "sha256": null }
  ],
  "directories": [
    { "path": "briefs", "entries": ["001_a.md", "README.md"] },
    { "path": "briefs/archive", "entries": null }
  ],
  "git": null
}
```

- **`files`**: each file read, with the SHA-256 of its bytes in hex, and each name a configuration was looked for under and was not there, with `null`: it must still not be there.
- **`directories`**: each directory the briefs were listed from, with the names of the regular files directly in it, sorted as JavaScript sorts strings. A link and a directory are no file here, and a file that is no brief is named though it is not read, since one renamed would be. A directory looked for and not found, as an archive not yet made, has `null`: there must still be no directory there.
- **`tool`**: the version that read them. **`git`**: `null`, since `list` reads nothing of git, and asks it nothing where a configuration file names the root.
- **Paths** are POSIX, from the root, which wherever `keep` is `true` is the directory the run started in.
- **`keep` is `false`**, and the lists are empty, wherever spec-brief cannot name every input: a run that starts below its configuration's directory, or names a configuration in another, and one with no configuration file, where git or the search above the root finds the root.

## `spec-brief matrix`

Compares the `affectedFiles` of every pair of live briefs in the same wave, `--all-waves` for every pair. Deferred briefs, and briefs that wait on one directly or through another, are listed and left out: they run in no wave until the deferred work comes back, as `schedule` places them nowhere, so the two agree on which briefs run side by side.

```text
wave 1 · 3 briefs
       001  002  003
  001    ·    X    ·
  002    X    ·    ·
  003    ·    ·    ·
  X 001 "src/auth/**" and 002 "src/**/session.ts" both cover src/auth/session.ts
  ? 003 declares no affectedFiles and cannot be checked
```

Scopes are intersected as globs, not compared as strings: the two above share no prefix and still meet. Exit 1 on a collision.

- **The file named** is one both patterns match and neither brief protects - always a file, never a directory. It is a file the tree holds where there is one, the first in git's order; where the tree holds none, it is the shortest path the search built, said to be an example: `both cover src/newmod/a.ts, an example not in the tree`. `--format json` says which, as `inTree` on each pair of patterns: `true`, `false`, or `null` when the tree could not be read.
- **One collision per pair of briefs**: two briefs whose scopes meet in several places are one collision, listing every pair of patterns that meets.
- **Unscoped**: a brief with no scope is reported as unscoped rather than counted as safe.
- **Writing what another protects**: a brief whose `affectedFiles` reach a file another brief of the wave protects, outside its own `protectedFiles`, is marked `!` and gets `writes-protected`, a warning, on the writer: run side by side, it changes what the other round was promised would hold. Each pair of patterns is listed with the file named, as a collision's are; `--format json` lists them under `protectedWrites` in each wave, with `writer`, `owner`, `overlaps` and `undecided`. A collision on the same pair is marked `X`.
- **Undecided**: the search for a shared file has a budget; a pair it cannot decide within it is marked `?` and reported as `collision-undecided`, a warning, never as a collision and never as clean - unless the tree holds a file both patterns match and neither brief protects, which proves the collision.
- **A mark is a finding**: the grid marks a pair, and a line beneath it says why, only for what the run reports, so a [rule](rules.md) that is off marks nothing. `shared-directory` is off unless the configuration turns it on; on, two briefs that write into one directory without sharing a file are marked `~`. `--format json` lists every pair the comparison found under `waves`, and the `findings` the run reports beside them.

## `spec-brief schedule`

Computes the waves the live briefs can run in, drafts included, and sets each beside the wave it declares:

- A brief runs after every dependency that is still live - an archived one is done - and shares a wave with no brief whose writable scope meets its own.
- Briefs are taken in dependency order, ties broken by id, and each goes into the lowest wave that is after its dependencies and holds nothing it collides with.
- A brief with no `affectedFiles` cannot be proved apart from anything, so it runs in a wave of its own and is reported as `unscoped`.
- The first wave is the lowest any brief declares, or 1.

```text
wave 1 · 2 briefs
  001  Rotate session tokens
  003  Audit log            moves from wave 2
         wave 2 also holds
         nothing holds it later
wave 2 · 1 brief
  002  Store sessions       moves from wave 1
         wave 1 does not hold: 001 there also writes src/auth/session.ts
         not wave 1, where 001 also writes src/auth/session.ts ("src/**/session.ts" and "src/auth/**")

waits: 007 on 006, which is deferred
deferred: 006
2 briefs would move; "spec-brief schedule --write" writes the waves
```

Each move says why:

- first, whether the declared wave holds - whether `lint` and `matrix` would pass it: no brief there that it collides with, its dependencies in earlier waves, and the briefs that depend on it in later ones;
- the dependency that sets the earliest wave;
- for every wave passed over, the brief there and the file both would write.

A deferred brief, and one that waits on it, is placed nowhere; a dependency cycle is an error, and nothing in or after it is placed.

`--write` sets `wave` in the front matter of each brief whose wave changes, in one transaction, and writes nothing over a cycle:

- every other line stays as it was;
- a comment after the old wave, `wave: 2  # after the review`, stays after the new one;
- a brief whose lines end in both LF and CRLF is written with the ending of its first line throughout, as `archive` writes one.

`--format json` gives an orchestrator the waves, each brief's declared and proposed wave with the reasons and whether the declared one holds, and what waits on what; `sarif` and `gitlab` carry a `wave-schedule` finding per move, and `github` one per move that is an error, and each that is a note as well under `--verbose`.

The result is the same every time for the same briefs. It is a valid schedule, not always the shortest: no fast method promises the fewest waves, and a person can always move a brief later by hand, which `lint` and `matrix` then check. So a move is an error only when the declared wave does not hold, or there is none: a declared wave that holds is the person's to keep, and its move is a note.

| Exit | When |
| --- | --- |
| `0` | Every declared wave holds. |
| `1` | A brief declares no wave or one that does not hold, or the dependencies form a cycle. |
| `2` | The run cannot be trusted. |

## `spec-brief archive <brief>`

Closes a round. Refused, with every reason, when:

- the brief has lint errors, is a draft, or depends on a brief that is still live;
- a task item is neither ticked nor dispositioned:
  - an open box counts as closed when a note under it starts with one of the `dispositions` (`**Delegated`, `**Accepted debt`, `**Rejected` by default);
  - a note is a line under the box, above any box nested in it, that starts a bullet, a paragraph after a blank line, or a line after one that ends a sentence;
  - a line that continues a sentence is the box's text wrapping, not a note, so `- [ ] Explain why the` over `  **Rejected** designs failed` is open, and `- [ ] Add a cache.` over `  **Rejected** by 012` is closed;
- the working tree holds uncommitted work outside the brief directories (`--allow-dirty` to proceed);
- the round's commit changed a file in `protectedFiles` - one refusal per file, naming it, unless a spec-brief plugin that verifies rulings [waives it](plugins.md#waiving-a-refusal).

Three warnings, which `--strict` turns into refusals:

- Changes outside `affectedFiles` are a warning, and an error under `--strict`.
- A round that changed the scope it runs under gets `scope-changed`. The brief is compared with its copy where the changes are measured from - the merge base with `--base` or `archiving.base`, the commit's parent with `--commit` alone - and each pattern `protectedFiles` no longer covers, and each `affectedFiles` gained, is one finding, naming the pattern and the files the round changed that it let through. Only the two scope fields are compared, by what they cover, so a tick, a ruling row, the banner, or a pattern rewritten to say the same is no change; an `affectedFiles` that empties bounds nothing, and is one. A file whose protection the round dropped is reported there and not again as out of scope. A brief the round wrote, which the merge base does not have, is not compared. A plugin that verifies rulings may [waive it](plugins.md#waiving-a-refusal) by the pattern.
- A scope is never passed by checks that measured nothing. When the files the round changed are unknown - no `--commit`, `--base` or `archiving.base`, `--no-git`, or a commit already in the base branch, as on `main` after the merge - a brief that declares one gets `scope-unmeasured`, a warning, and a refusal under `--strict`.

Otherwise, in one transaction, it:

- writes the archived brief with its status set, a frozen banner under the front matter, every relative link rewritten for the archive directory, and an `integrity` hash;
- rewrites the links other live briefs hold to it;
- removes the original.

With `archiving.rewriteLinks` off, no link is rewritten, and the links other live briefs are left holding are reported as `stale-link`. Archiving an archived brief does nothing and exits 0.

| Option | What it does |
| --- | --- |
| `--commit <rev>` | Records the commit and the files it changed. |
| `--base <rev>` | Measures from the merge base instead, for a branch of several commits. |
| `--pr <n>` | Links the pull request. |
| `--summary <text>` | What the round did, in the banner. |
| `--date <YYYY-MM-DD>` | The date in the banner, where it is not [today's](options.md#todays-date). |
| `--dry-run` | Prints the plan and the banner, and writes nothing. |

spec-brief reads git and never writes it. Review the change and commit it with the round.

## `spec-brief unarchive <brief>`

Reopens an archived brief: the banner and the hash come off, the status goes back to the live word, and the links are rewritten again. A brief archived and reopened is the brief it was, blank lines and final newline included, with four exceptions:

1. The status line is written in its plain spelling.
2. A relative link that had to be rewritten comes back in its shortest form (`./b.md` returns as `b.md`).
3. An empty front matter block, `---` over `---`, comes back as none, since archival gives a brief with no front matter a block for its hash and reopening takes away a block it leaves empty.
4. A brief whose lines end in both LF and CRLF comes back with the ending of its first line throughout.
