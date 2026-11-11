# CI and output formats

`lint`, `matrix` and `schedule` report findings, and write them in five formats: `pretty` for a person, and `github`, `sarif`, `gitlab` and `json` for a pipeline. The other commands write `pretty` and `json`.

## In CI

After the job has installed the project, with `npm ci`:

```yaml
- run: npx --no-install @spec-family/spec-brief lint --format github
- run: npx --no-install @spec-family/spec-brief matrix --format github
- run: npx --no-install @spec-family/spec-brief schedule --format github
```

Each gives `npx` the package's [full name](../../README.md#names) and `--no-install`: a job that lost its install step then stops, where the command's name alone would fetch whatever package has that name.

## Formats

| Format | What it writes |
| --- | --- |
| `github` | Workflow commands, which annotate the pull request with no upload and no permission: errors and warnings, and notes under `--verbose` ([below](#github)). |
| `sarif` | SARIF 2.1.0, for code-scanning upload. |
| `gitlab` | A GitLab Code Quality report - an array of `{ description, check_name, fingerprint, severity, location: { path, lines: { begin } } }` - for a merge request to show. |
| `json` | A versioned document for anything else: `schemaVersion` changes when a field changes meaning, and is 2 since a collision became a pair of briefs rather than a pair of patterns. |

## GitHub

`--format github` writes a workflow command for each finding it annotates, and the job's log turns each into an annotation on the pull request's diff:

```text
::error file=briefs/001_a.md,line=3,title=spec-brief unknown-type::"epic" is not a brief type here. use one of "feature", "defect", "refactor", "chore"
```

- An error is an `error` and a warning a `warning`, titled `spec-brief` and the rule; the message carries the hint.
- **A note is annotated only under `--verbose`**, as a `notice`. A note is what a round expects, such as `glob-matches-nothing` for a file the round has not created yet, and annotated it stood on every pull request of the round. A note fails no run, so the exit code is the same with `--verbose` or without it, and the other formats write every note either way.
- `%` and line breaks are escaped everywhere, and `:` and `,` in the file and the title, as GitHub reads them.
- A run with nothing to annotate writes nothing.

## GitLab

```yaml
spec-brief:
  script:
    - npm ci
    - npx --no-install @spec-family/spec-brief lint --format gitlab > gl-code-quality.json
  artifacts:
    reports:
      codequality: gl-code-quality.json
```

In the GitLab report:

- An error is `major`, a warning `minor` and a note `info`; GitLab's `critical` and `blocker` are for security holes and crashes, which no finding here is.
- The `description` is the message and the next action.
- The fingerprint is a SHA-256 of what the finding is: its rule, its file, its brief, and what it is about there - a section, a pattern, a dependency, the other brief of a pair - never the message, the hint or the line. So a finding that moves, or is worded another way, or a collision that names another file both briefs write, is the same issue; two findings alike in all four, such as two problems in one front matter, are told apart by their order.
