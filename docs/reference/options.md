# Options, exit codes and refusals

What every command takes, what its exit code means, and the lines spec-brief refuses rather than guess at. Each command's own options are with it under [commands](commands.md).

## Every command

Every command takes these, except where the last column names it: an option is [refused where taking it would tell someone what is not so](#an-option-a-command-does-not-read).

| Flag | What it does | Not for |
| --- | --- | --- |
| `--root <dir>` | Runs from another directory, which must be there: only `init` makes one that is not. | |
| `--config <file>` | Names the configuration. | `init`, which writes `.spec-brief.json` |
| `--no-config` | Uses the defaults. | |
| `--format <format>` | `pretty` by default, which `human`, the word spec-graph and spec-guard use, names too, or `json`; `lint`, `matrix` and `schedule`, which report findings, also write `sarif`, `github` and `gitlab`, and `--help` lists each command's formats. | |
| `--strict` | Makes warnings fail the run. | `init`, `new` and `list`, which have none |
| `--no-git` | Leaves git out even inside a repository: the tree is read from disk, and `archive` records no commit. | |
| `--color` | Colour, whatever the environment and the terminal say. | `init` and `new`, which print none |
| `--no-color` | No colour, whatever they say. | |
| `--help`, `--version` | Do what they say, on a line that is otherwise one to run: [a line refused for what it holds](#the-help-on-a-wrong-line) is refused with either of them on it, and the two together are refused. | |

Without `--color` or `--no-color`, `NO_COLOR` set to anything turns colour off; otherwise `FORCE_COLOR` turns it on, and `FORCE_COLOR=0` or `FORCE_COLOR=false` off, on a terminal too; otherwise `TERM=dumb` turns it off; otherwise a terminal has colour and a pipe has none. `NO_COLOR` or `FORCE_COLOR` set to nothing is as unset. Only the `pretty` format has colour.

## Exit codes

| Code | Means |
| --- | --- |
| `0` | Clean. |
| `1` | Findings, a collision, or a refused action. |
| `2` | The run could not be trusted, or its answer did not arrive - a bad flag, [an input that names nothing](#an-input-that-names-nothing), [an option the command does not read](#an-option-a-command-does-not-read), [an option given two values](#an-option-given-two-values), a configuration that does not load, a brief that does not exist, a git command that failed, a `SOURCE_DATE_EPOCH` that [cannot be read as a date](#todays-date) where one is to be written, a stdout its reader closed before all of the output was written, as a pipeline into `head` does, each said in one line on stderr, or an error spec-brief did not expect, reported on stderr as `spec-brief: unexpected error:` with its stack. |

A run over a briefs directory that does not exist exits 2, because a check over nothing looks exactly like a clean one.

## An input that names nothing

An option, an argument or a path that is given and names nothing is refused: exit 2, one line that names it, nothing written. None is read as if it had not been given. `--root "$DIR"` where the variable is not set would otherwise run in the current directory, and the answer would look like the one that was asked for.

- **An option given nothing.** Every option that takes a value refuses one that is empty or only space, by the option's name: `--id is "", which is no value`. No option gives an empty value a meaning; leave the option out for what it does by default.
- **A list that names nothing.** `--affected` and `--protected` refuse a place that names no pattern, `src/a,,src/b` or `src/a,`, as `--depends-on` refuses one that names no brief. `--depends-on ,` names no brief, and a brief that depends on nothing is one scaffolded without the option. A place in a list that names no brief, the comma too many in `7,8,` or the gap in `7,,8`, is refused as well: it is a brief left out, as `"$A,$B"` is with one of the two unset.
- **An argument a command does not take.** `init`, `list`, `matrix` and `schedule` take none and refuse one by name, with their usage. `init mydir` set up the current directory; `init --root mydir` is what sets up another.
- **A `--root` that is no directory.** A file, or a path that does not exist, is refused: the search for a configuration would go on from its parent, and the run would report on, or `new` write into, the tree above. A directory below the configuration's is a place to start from, as the current directory is.
- **A configuration that is not a file**, named by `--config` or found under the configuration's name, does not load, and is said so in a line before it is opened, as one that is not JSON is: a directory, a named pipe, which was read without end, a socket or a device. A link is read as what it names.
- **A template, a plugin or what stands where a brief would move that is not a file** is refused in a line before it is opened, and nothing is written: the `template` a configuration names, a plugin's module and each `package.json` spec-brief reads to find one, and what stands where `archive` or `unarchive` would write the brief, which a plan made from the files a listing names cannot have seen. A named pipe there had the run wait without end, a link to `/dev/null` as the template wrote a brief of no bytes, and a directory or a socket ended the run on a stack. A link is read as what it names.

## An option a command does not read

An option is refused where taking it would tell someone what is not so: exit 2, one line that names the command, the option, what the command does read and what it takes besides, nothing written. `init --strict` would otherwise say the briefs had been set up strictly, and `init --config team.json` that the configuration had been written there.

| Command | Refuses | Because it would say |
| --- | --- | --- |
| `init` | `--config`, `--strict`, `--color` | That the configuration was written to the file named, where `.spec-brief.json` is; that something was strict, where `init` has no warning to fail on; that colour was printed, where it prints none. |
| `new` | `--strict`, `--color` | That a warning would have failed it, where it has none; that colour was printed, where it prints none. |
| `list` | `--strict` | That a warning would have failed it, where it reports no finding. |

```text
spec-brief: init does not read --strict; it reads --root, --format, --briefs and --archive, and takes --no-config, --no-git and --no-color
```

- **Two options of which one would go unread** are refused together, for the same reason: `--config <file>` beside `--no-config` says the file was read, where the defaults ran and it was never opened, and `--color` beside `--no-color` that colour was forced on, where it was off. Give one of the two.
- **An option that asks a command to leave out what it never does is taken**, since it asks for what is already so: `--no-color` by `init` and `new`, which print no colour, `--no-git` by `init`, which asks git nothing, and `--no-config` by `init`, which opens no configuration file. A script that runs every command in a tree without git, or into a log, passes such an option to each of them. `init --no-config` still writes over no configuration: where one is there, it stops as `init` does.
- **An option a format has nothing to read for is taken**: `--no-color` or `--color` beside `--format json` changes nothing, and a caller that asks for JSON passes `--no-color` beside it; nor does `--verbose` beside any format but `github`, since the others write every note.
- **`--help` and `--version` are no way past a refusal**: `init --strict --help` is refused as `init --strict` is ([the help on a wrong line](#the-help-on-a-wrong-line)).

## An option given two values

An option that takes one value is given one. Given two that read as two, the run is refused: exit 2, one line that names both as they were written, nothing written. The later was read and the earlier went unread, with no word of it: `list --root nowhere --root .` listed `.`, and `lint --format json --format pretty` printed `pretty` to a script that had asked for JSON.

```text
spec-brief: --root is given "nowhere" and ".", and takes one value; give one of the two
```

- **One value given twice is taken once, however it is written.** Two values are compared as each is read: `--root` and `--config` as the paths they resolve to, so `--root .` beside `--root ./`, and on Windows with the drive letter in either case, so `C:\x` beside `c:\x`, where `C:\x` beside `C:\X` is two; `--briefs` and `--archive` as directories of the repository, so `specs` beside `./specs/`; `--wave` and `--pr` by the number their digits write, so `1` beside `01`; `--depends-on` by the set of ids it names, each as an id is matched to a brief, so `7,8` beside `8,7` or `7, 8`, and `7` beside `007`, and the brief is written with the later; `--summary` with the spaces around it taken off. Any other value is read as it is written, in its own case.
- **A revision written two ways is asked of git**: `archive` asks git once what commit each value of `--commit`, or of `--base`, names, and takes `HEAD` beside the hash it names as one value. Two that name two commits, or one git cannot name, are two values; so are any two beside `--no-git`, `--help` or `--version`, none of which asks git.
- **Every option that takes a value takes one.** `--depends-on` is a list written in one value, and no option adds to a list each time it is given. A flag given twice is that flag once.
- A shell alias or a script that gives an option, and a line that gives it again to override it, is refused: give the option once.

## The help on a wrong line

A line refused for what it holds is refused with `--help` or `--version` on it, before it or after it, as an option spec-brief does not know always was. `init --strict --help` printed the help and `list --format sarif --version` the version, each exit 0, and said nothing of what was wrong. `--help` beside `--version` is refused too, in either order: one of the two answers went unread.

```text
spec-brief: --help is given beside --version, and one of the two answers would go unread; give one of the two
```

- **What the line alone decides is refused there**: an option or a command spec-brief does not know, [an input that names nothing](#an-input-that-names-nothing), [an option the command does not read](#an-option-a-command-does-not-read) and the pairs, `--commit` or `--base` beside `--no-git`, a `--format` the command does not write, [two values](#an-option-given-two-values), a `--wave` or `--pr` that is no number it takes, a `--date` that is no date, a revision that begins with `-`, a directory for `init` outside the repository or one for both, and a second brief for `archive` or `unarchive`.
- **What only the tree can refuse is not asked**: a `--root` that is not there, a configuration that does not load, an id that is taken, a type the configuration does not have, a brief or a commit that is not there. `--help` and `--version` open nothing, and answer.
- **What a command lacks is what the help is asked about**: `new --help` and `archive --help` print the help, though `new` without a title and `archive` without a brief are refused.

## Today's date

`new` writes a date into the front matter and `archive` one into the banner: the one `--date` gives, or today's. Today is the clock's date in UTC, unless `SOURCE_DATE_EPOCH` is set, the variable a pipeline sets to have every run write the same bytes ([its specification](https://reproducible-builds.org/specs/source-date-epoch/)): then it is the date of that time, in UTC.

- **What it holds**: whole seconds since 1970-01-01 in digits alone, as `date +%s` prints them, from `0` to `253402300799`, the last second of 9999-12-31 and of the dates written `YYYY-MM-DD`.
- **Anything else is refused**, never read as unset: a word, `1.5`, `-1`, a space or a newline beside the digits, a later time, or nothing at all, which is what `SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)` leaves where git failed. `new` and `archive` then write nothing and exit 2 with a line that names the variable and shows what it holds. The clock's date, written where a pipeline asked for its own, would look like any other.
- **Only a run that would use it reads it**: `--date` gives the date instead, and `init`, `lint`, `list`, `matrix`, `schedule`, `unarchive`, `--version` and `--help` write none, so each runs whatever the variable holds.
