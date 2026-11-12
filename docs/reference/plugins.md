# Plugins

A plugin here is a spec-brief plugin, a module this tool loads, not a Claude Code plugin. It exports `{ name, rules }`, or a function of its configured options that returns one. Its rules run beside the built-in ones as `<name>/<rule>`, and configuration sets their severity like any other.

```js
// tools/departures.mjs
export default (options) => ({
  name: 'departures',
  rules: [{
    id: 'signed',
    description: 'every departure is signed',
    severity: 'error',
    check: ({ brief }) => brief.text.includes(options.marker) ? [] : [{ line: 1, message: 'has an unsigned departure' }],
  }],
});
```

```json
{ "plugins": [{ "module": "./tools/departures.mjs", "options": { "marker": "Signed-off-by" } }] }
```

A result is `{ line, message }`, with optional fields:

| Field | What it is |
| --- | --- |
| `hint` | The next action. |
| `severity` | Lower than the rule's, for this one finding. |
| `subject` | What the finding is about, where the rule can report several in one brief; GitLab's fingerprint is built from it. |

This is where integrations belong. A tool that defines a format - signed departures, recorded reproducers, a code graph's blast radius - is the one that can check it, and spec-brief carries no copy of formats it does not own. Loading a plugin runs its code, exactly as loading a linter configuration does.

A path is relative to the root. A package is found from the root as an `import` there would find it, its `exports` read under the import conditions, so a plugin published as ESM only loads, and so does a subpath such as `@spec-family/spec-harness/spec-brief-plugin`.

## Waiving a refusal

A plugin may also export `waive`, which lets the archive accept a change its own check allows - spec-harness's spec-brief plugin verifies a signed ruling for a protected path, which spec-brief does not know how to read.

```js
export default () => ({
  name: 'rulings',
  rules: [],
  // context: { root, brief: { id, file, text }, findings, warnings, base, commit }
  waive: async ({ findings }) =>
    findings
      .filter((f) => f.rule === 'protected-file' && verifiedRulingCovers(f.path))
      .map((f) => ({ rule: f.rule, path: f.path, reason: 'ruling R3, signed by alice, allows it' })),
});
```

- `findings` are the archive's refusals, and `warnings` its `scope-changed` warnings, each as a frozen copy: a hook reads them and cannot change them, and a write to them throws.
- Three can be waived, and no others: `protected-file`, one per file, which names its `path`; `out-of-scope`, which refuses only under `--strict` and lists its `paths`; and `scope-changed`, one per pattern the round dropped from `protectedFiles` or added to `affectedFiles`, which names the pattern as its `path`, lists the files the change let through as its `paths`, and is among the `warnings` unless `--strict` makes it a refusal.
- A waiver matches one of the plan's own refusals by rule and path, or a `scope-changed` warning by its pattern, and turns it into a `waived` note naming the plugin, the rule, the path and the reason. A `scope-changed` finding is waived by its pattern alone, never by a file it let through. An `out-of-scope` warning is not waived. A waiver for any other rule is ignored with a `waiver-ignored` warning.
- The hook is asked only when the plan has a refusal or a `scope-changed` warning it could lift.
- A hook that returns nothing waives nothing. One that throws - a write to `findings` included - or answers in another shape stops the run with exit 2, as a plugin that fails to load does.
