# spec-brief reference

Everything spec-brief reads, writes and reports. These pages ship in the npm package beside the code, so the copy in `node_modules/@spec-family/spec-brief/docs/reference/` describes the version installed; on GitHub they describe main. The [README](../../README.md) is the front page: what spec-brief is, a quick start, and the commands and checks at a glance.

| Page | What it holds |
| --- | --- |
| [The brief](brief.md) | The front matter, deferred work, the claims a round raises and the rows it waits on, scope patterns, and how a heading, a task and a link are read. |
| [Commands](commands.md) | Each of the eight commands in full, with its options and output. |
| [Options, exit codes and refusals](options.md) | What every command takes, colour, the exit codes, the lines refused rather than guessed at, and today's date. |
| [Configuration](configuration.md) | Every key of `.spec-brief.json`, its default, and a section's `hint`. |
| [Rules](rules.md) | Each rule, its default severity and what it reports, and the reasons `archive` refuses. |
| [CI and output formats](formats.md) | The jobs, and the `github`, `sarif`, `gitlab` and `json` formats. |
| [As a library](library.md) | The engine the CLI runs, and the pure functions below it. |
| [Plugins](plugins.md) | Rules a module contributes, and the refusals a plugin may waive. |

The family's guides are in spec-core: the [tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md) takes one round from the brief to the archive, [adopting](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md) brings the tools into a repository, and [concepts](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md) defines the family's words.

## What it does not do

- **No status file.** There is no `manifest.json` to keep in step. A brief and the directory it sits in are the record; `list --format json` is the index, computed when asked. A committed index is also the one file every round merging in parallel edits.
- **No roadmap editing.** A roadmap is a document people write. spec-brief reports on briefs; it does not rewrite prose around them.
- **No git writes.** It reads commits, diffs and the working tree, and leaves staging and committing to whoever does them.
- **No labels as sections, yet.** Sections are headings. A repository that marks its sections with bold or bracketed labels instead, `**Your Mission:**` or `[STANDING DIRECTIVES]`, is not described by this version.

## Design

The decisions and what they cost are in [`docs/adr/`](https://github.com/spec-family/spec-brief/blob/main/docs/adr/README.md), which the package does not ship.
