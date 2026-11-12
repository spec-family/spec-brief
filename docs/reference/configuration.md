# Configuration

`.spec-brief.json` (or `spec-brief.json`) at the root; the nearest one above the working directory is used, and its directory is the root. It is a file, and JSON, validated against [`schema.json`](../../schema.json): an unknown key, a misspelt rule or a value of the wrong type stops the run with exit 2 rather than falling back to defaults and reporting on the wrong rules.

## Keys

| Key | Default | What it says |
| --- | --- | --- |
| `briefs` | `"briefs"` | Directory of live briefs. |
| `archive` | `"<briefs>/archive"` | Directory of archived briefs. |
| `files` | `"[0-9]*.md"` | Glob a file name must match to be a brief. |
| `exclude` | `[]` | File-name globs that are never briefs, such as an index. |
| `template` | `null` | A template file for `new`, with `{id}`, `{title}`, `{date}`, `{type}`, `{wave}`, `{status}`. |
| `id` | `{ "source": "filename", "separator": "_", "digits": 3 }` | Where an id comes from, and how a new one is written. |
| `status` | `{ "field": "status", "draft": "draft", "active": "active", "deferred": "deferred", "archived": "archived" }` | The words a repository uses. `field` may be a key of any script, `狀態` as well as `status`, followed by an ASCII colon in the brief; `field: null` reads status from location alone; `draft` and `deferred` may be `null` where a repository has no such word. |
| `sections` | Intent, Negative Scope, Not Empowered (optional), Invariants (checklist) | Sections every live brief carries: a name, or `{ name, aliases, mustContain, checklist, optional, hint }`. `hint` is below. |
| `sectionOrder` | `false` | Sections must appear in the listed order. |
| `types` | `feature`, `defect`, `refactor`, `chore` | Brief types and the sections each adds. |
| `placeholders` | `TBD`, `TODO`, `FIXME`, ... | Words that mark a section as unwritten: alone or ended by `.`, `!`, `?`, `;`, `…` or `-`, and then nothing, or a space, a colon or an em dash and a note. `TODO.md` and `TODO-driven` are words, not placeholders. |
| `fields` | `[]` | Front-matter keys the repository uses beyond the built-in ones. |
| `archiving.tasks` | `"all"` | `"all"`, or the sections whose boxes must be closed. |
| `archiving.dispositions` | `**Delegated`, `**Accepted debt`, `**Rejected` | What a note under an open box starts with to close it. |
| `archiving.banner` | see [`src/config.ts`](https://github.com/spec-family/spec-brief/blob/main/src/config.ts) | Banner lines, with `{date}`, `{summary}`, `{pr}`, `{commit}`, `{diffstat}`, `{links}`, `{id}`, `{title}`, `{author}`. A line with an empty placeholder is left out. |
| `archiving.rewriteLinks` | `true` | Rewrite relative links when a brief moves: its own, and the ones other live briefs hold to it. Off, neither is edited, and the links other briefs are left holding are reported as `stale-link`. |
| `archiving.freeze` | `true` | Write an integrity hash, so a later edit is caught. |
| `archiving.base` | `null` | Branch the diff is measured from, such as `"main"`. |
| `claims.labels` | `{}` | Each label a claim is written with, and whether it says the work is `"done"` or `"open"`, for the claims a brief [raises](brief.md#claims-a-round-raises-rows-it-waits-on). |
| `registers.settled` | `[]` | The statuses that settle a register row a brief [awaits](brief.md#claims-a-round-raises-rows-it-waits-on), compared without case by the word a status opens with; words spec-graph reads as settled too, as the [brief](brief.md#claims-a-round-raises-rows-it-waits-on) says. |
| `rules` | `{}` | Severity per rule: `off`, `note`, `warning` or `error`. `info` and `warn`, the words spec-graph configures, are read as `note` and `warning`, so one vocabulary serves both tools; findings report the words spec-brief uses. |
| `plugins` | `[]` | Modules that contribute rules: a path or package, or `{ module, options }`. |

## A section's hint

A section's `hint` says what the section must answer, so a tool helping to write a brief can ask for each section by what it is for:

- a new brief carries it as a comment under the heading;
- a finding that the section is missing or unwritten gives it as the next step;
- the JSON of `list` and `lint` reports it.

## An example

A repository whose briefs have eight ordered sections, `proposed` and `archived` for words, and a banner of its own:

```json
{
  "$schema": "./node_modules/@spec-family/spec-brief/schema.json",
  "files": "[0-9][0-9][0-9]_*.md",
  "status": { "draft": null, "active": "proposed", "archived": "archived" },
  "sections": [
    "Mission",
    { "name": "Standing directives", "mustContain": ["Latest ≠ Newest"] },
    "Context",
    { "name": "Deliverables", "checklist": true },
    "Not empowered",
    "Architectural empowerment",
    "Verification",
    "Report"
  ],
  "sectionOrder": true,
  "types": {},
  "archiving": {
    "tasks": ["Deliverables"],
    "banner": ["**Executed {date} in pull request {pr}.** {summary} The body below describes the tree before execution and is not maintained."]
  }
}
```

How a heading fills a section, and what counts as a heading, a task or a link, is under [How a brief is read](brief.md#how-a-brief-is-read).
