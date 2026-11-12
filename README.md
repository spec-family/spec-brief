# spec-brief

**Lint the contract a round of work runs under, map which rounds can run side by side, and archive a finished one in one atomic command.**

A *brief* is the input to one round of work - for a coding agent or a person: what done looks like, what the round must not touch, and the checks that prove it finished. spec-brief manages briefs as files in your repository. It has no runtime dependencies, reads and writes nothing but Markdown in two directories, and never writes to git.

spec-brief is one of the [spec-\* tools](https://github.com/spec-family/spec-core#the-family). The family's words - brief, round, wave, scope, the two kinds of plugin - are defined in [concepts](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md), and the [tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md) takes one round from the brief to the archive.

## Quick start

```bash
npm install --save-dev @spec-family/spec-brief
npx --no-install @spec-family/spec-brief init
npx --no-install @spec-family/spec-brief new "Rotate session tokens on privilege change" --wave 1
npx --no-install @spec-family/spec-brief lint
```

`init` writes `.spec-brief.json` and the `briefs/` and `briefs/archive/` directories. `new` scaffolds `briefs/001_rotate-session-tokens-on-privilege-change.md` as a draft, each required section holding its hint in a comment, and a comment is not content, so `lint` reads the fresh brief as unwritten:

```text
briefs/001_rotate-session-tokens-on-privilege-change.md
  11  warning  the "Intent" section is empty  empty-section
               The state of the tree when this round is done, and why it matters. One paragraph.
  15  warning  the "Negative Scope" section is empty  empty-section
               What this round must not do, even where it would look helpful.
  19  warning  the "Not Empowered" section is empty  empty-section
               Files, interfaces and decisions this round may not change.
  23  warning  the "Invariants" section holds only a placeholder  placeholder
               Checks that must hold before the round is called done, each one a task item.

0 errors, 4 warnings, 0 notes in 1 brief(s)
```

In a draft these are warnings; once the brief says `status: active` they are errors, and the run fails until each section says something.

## Names

The package is `@spec-family/spec-brief`, and the command it installs is `spec-brief`. The name without the scope is not this project: on npm, `spec-brief` belonged to nobody on 2026-10-07, and whoever registers it decides what it runs.

`npx` fetches and runs the package of whatever name it is given when the project has none installed - a fresh clone, a worktree before `npm ci`, a CI job without the install step - and without a terminal it does not ask first. So give `npx` the full name:

- `npx --no-install @spec-family/spec-brief` in a project that installed it: it runs that install, the version the lockfile pins, and where there is none it stops with an error that names this package.
- `npx @spec-family/spec-brief`, without `--no-install`, where nothing is installed: it fetches this package and runs it.

<!-- bare-name: the two forms in the next sentence are shown as what not to write -->
Never `npx spec-brief`, and not `npx --no-install spec-brief` either: `--no-install` stops a download, and npm still runs a copy of the bare name's package that an earlier fetch left in its cache. A `package.json` script names the command alone, as in `"briefs": "spec-brief lint"`, because npm fetches nothing for a script. The family's [adopting guide](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md#names) has what was measured, under npm 10, 11 and 12.

## Why

Repositories that run agents on briefs end up doing the same ceremony by hand, and getting it wrong in the same places:

- **A brief that is incomplete.** A missing negative scope or an empty invariant list is how a round wanders. `lint` checks the sections your repository requires, in the order it requires them, and that each one says something.
- **Two rounds that write the same files.** Run in parallel, they collide at merge time. `matrix` compares the scopes of briefs scheduled in the same wave *as globs*, and names a file both would write.
- **Archival.** Move the file, set its status, write a frozen banner with the date, the pull request and the commit, disposition every open box, add `../` to every relative link so they still resolve, fix the links other briefs hold to it. `archive` does all of it as one transaction, or none of it.

The conventions are not invented here. They were measured against two repositories that already keep briefs - one with front matter and eight ordered sections, one with none at all - and everything they disagree on is configuration.

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

`affectedFiles` is the scope the round may write, as globs, and `protectedFiles` what it is not empowered to change; `dependsOn` and `wave` say when it runs. [The brief](docs/reference/brief.md) has the rest: deferred work, the claims a round raises and the register rows it waits on, the scope patterns, and how a heading, a task and a link are read.

## Commands

| Command | What it does |
| --- | --- |
| `spec-brief init` | Writes `.spec-brief.json` with every default spelled out, and the brief and archive directories. |
| `spec-brief new <title>` | Scaffolds a brief with the next free number and every required section. |
| `spec-brief lint [brief...]` | Checks every brief, or the ones named, against the sections and fields the repository requires, and an archived one for its freeze. |
| `spec-brief list` | Live briefs with their status, wave, task count, readiness and title; `--ready` for the ones that can run now. |
| `spec-brief matrix` | Compares the scopes of the briefs in each wave as globs, and names a file two of them would both write. |
| `spec-brief schedule` | Computes the waves the live briefs can run in and says why each brief moves; `--write` sets them. |
| `spec-brief archive <brief>` | Closes a round in one transaction - banner, links, integrity hash, the move - or refuses with every reason. |
| `spec-brief unarchive <brief>` | Reopens an archived brief as the brief it was. |

| Exit | Means |
| --- | --- |
| `0` | Clean. |
| `1` | Findings, a collision, or a refused action. |
| `2` | The run could not be trusted, or its answer did not arrive: a bad flag, a configuration that does not load, a briefs directory that does not exist, among others. |

[Commands](docs/reference/commands.md) has each command in full, and [options](docs/reference/options.md) what every command takes, the exit codes, and the lines refused rather than guessed at.

## Checks

| What | Rules |
| --- | --- |
| The text and its front matter | `encoding`, `front-matter`, `field`, `unknown-field`, `status`, `id`, `duplicate-id`, `title`, `unknown-type` |
| The sections | `missing-section`, `duplicate-section`, `empty-section`, `placeholder`, `missing-checklist`, `must-contain`, `section-order` |
| Dependencies and deferred work | `dependency`, `dependency-cycle`, `wave-order`, `deferral-trigger` |
| Claims raised and rows awaited | `raises`, `awaits` |
| Scopes | `glob`, `scope-contradiction`, `empty-scope`, `glob-mistyped`, `glob-matches-nothing`, `literal-read-as-file` |
| Briefs side by side (`matrix`, `schedule`) | `collision`, `collision-undecided`, `unscoped`, `writes-protected`, `shared-directory`, `wave-schedule` |
| Archived briefs and archival | `archive-freeze`, `scope-changed`, `scope-unmeasured`, `stale-link` |

`archive` also refuses a round for reasons of its own, such as an open task, a live dependency, a claim still open, uncommitted work or a protected file changed. [Rules](docs/reference/rules.md) has what each rule reports and its default severity, and a [plugin](docs/reference/plugins.md) adds rules of its own.

## Configuration

`.spec-brief.json` at the root, validated against [`schema.json`](schema.json): an unknown key, a misspelt rule or a value of the wrong type stops the run with exit 2. `init` writes every default spelled out; a repository needs only what it changes:

```json
{
  "$schema": "./node_modules/@spec-family/spec-brief/schema.json",
  "sections": [
    "Intent",
    "Negative Scope",
    { "name": "Invariants", "checklist": true }
  ],
  "archiving": { "base": "main" },
  "rules": { "shared-directory": "warning" }
}
```

[Configuration](docs/reference/configuration.md) has every key and its default.

## In CI

After the job has installed the project, with `npm ci`:

```yaml
- run: npx --no-install @spec-family/spec-brief lint --format github
- run: npx --no-install @spec-family/spec-brief matrix --format github
- run: npx --no-install @spec-family/spec-brief schedule --format github
```

Each gives `npx` the package's [full name](#names) and `--no-install`: a job that lost its install step then stops, where the command's name alone would fetch whatever package has that name. A note, such as a file the round has not created yet, is annotated only under `--verbose`. [CI and output formats](docs/reference/formats.md) has GitLab's job, and the `sarif`, `gitlab` and `json` formats.

## Documentation

- [The reference](docs/reference/README.md), shipped in the package: [the brief](docs/reference/brief.md), [commands](docs/reference/commands.md), [options and exit codes](docs/reference/options.md), [configuration](docs/reference/configuration.md), [rules](docs/reference/rules.md), [CI and output formats](docs/reference/formats.md), [the library](docs/reference/library.md) and [plugins](docs/reference/plugins.md).
- The family's guides, in spec-core: the [tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md), [adopting the tools](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md), and [concepts](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md).

## Design

CI's full mutation sweep scores 99.32% over 7,886 mutants on 8f00fd9 (run 43053437250), and a sweep under 97% fails ([ADR-0009](https://github.com/spec-family/spec-brief/blob/main/docs/adr/0009-mutation-testing.md)).

The decisions and what they cost are in [`docs/adr/`](https://github.com/spec-family/spec-brief/blob/main/docs/adr/README.md). Working on spec-brief itself: [CONTRIBUTING.md](https://github.com/spec-family/spec-brief/blob/main/CONTRIBUTING.md); reporting a vulnerability: [SECURITY.md](https://github.com/spec-family/spec-brief/blob/main/SECURITY.md).

## License

MIT
