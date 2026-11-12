import { describe, expect, it } from 'vitest';

import { applyWaivers, type Plan, planArchive, WAIVABLE } from '../src/archive.js';
import { findingJson } from '../src/report.js';
import type { Finding } from '../src/types.js';
import { config, corpusOf, goodBrief } from './helpers.js';

/**
 * A plugin may lift two refusals of an archival - a protected file changed, a
 * file changed outside the scope - by rule and path, where its own check
 * allows them. spec-brief never learns how the check works.
 */

const A = 'briefs/001_a.md';
const COMMIT = { sha: 'abcdef1234', author: 'A', date: '' };

const table = (findings: readonly Finding[]): string[] =>
  findings.map((f) => `${f.line} ${f.severity} ${f.rule}: ${f.message}${f.hint === undefined ? '' : ` | ${f.hint}`}`);

function refused(strict = false): Plan {
  const corpus = corpusOf({ [A]: goodBrief({ affectedFiles: '[src/ok.ts]', protectedFiles: '[src/a.ts, src/b.ts]' }) });
  const changes = ['src/a.ts', 'src/b.ts', 'lib/x.ts', 'lib/y.ts'].map((path) => ({ path, insertions: 1, deletions: 0 }));
  return planArchive(corpus, corpus.briefs[0]!, { date: '2026-09-26', commit: COMMIT, changes, strict });
}

describe('the refusals a plugin can see', () => {
  it('name each protected file on a finding of its own, and every file outside the scope on one', () => {
    const plan = refused(true);
    expect(plan.blocking.map((f) => [f.rule, f.path, f.paths])).toEqual([
      ['protected-file', 'src/a.ts', undefined],
      ['protected-file', 'src/b.ts', undefined],
      ['out-of-scope', undefined, ['lib/x.ts', 'lib/y.ts']],
    ]);
    expect(findingJson(plan.blocking[0]!)).toMatchObject({ rule: 'protected-file', path: 'src/a.ts' });
    expect(findingJson(plan.blocking[2]!)).toMatchObject({ rule: 'out-of-scope', paths: ['lib/x.ts', 'lib/y.ts'] });
    expect('paths' in findingJson(plan.blocking[0]!)).toBe(false);
    expect(WAIVABLE).toEqual(['protected-file', 'out-of-scope', 'scope-changed']);
  });
});

describe('a waiver', () => {
  it('turns the refusal it matches into a note naming the plugin, the rule, the path and the reason', () => {
    const plan = applyWaivers(refused(), [{ plugin: 'harness', waiver: { rule: 'protected-file', path: 'src/a.ts', reason: 'ruling R1, signed by alice, allows it' } }]);
    expect(table(plan.blocking)).toEqual([
      '4 error protected-file: the round changed src/b.ts, which this brief protects | revert the change, or record the departure in the brief before archiving it',
    ]);
    expect(table(plan.warnings)).toEqual([
      '3 warning out-of-scope: the round changed 2 file(s) outside affectedFiles: lib/x.ts, lib/y.ts | widen affectedFiles if the scope was wrong, or say why in the summary',
      '4 note waived: harness waives protected-file for src/a.ts: ruling R1, signed by alice, allows it | review the waiver with the round; it stands where the refusal was',
    ]);
    expect(plan.warnings[1]).toMatchObject({ file: A, brief: '001', path: 'src/a.ts' });
  });

  it('matches by rule, not by path alone', () => {
    const plan = refused(true);
    expect(applyWaivers(plan, [{ plugin: 'p', waiver: { rule: 'protected-file', path: 'lib/x.ts', reason: 'r' } }], true)).toEqual(plan);
  });

  it('matches by path, not by rule alone', () => {
    const plan = applyWaivers(refused(), [{ plugin: 'p', waiver: { rule: 'protected-file', path: 'src/b.ts', reason: 'r' } }]);
    expect(plan.blocking.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(plan.warnings.map((f) => f.path)).toEqual([undefined, 'src/b.ts']);
  });

  it('takes one path at a time out of a refusal that names several, and the refusal with the last', () => {
    const waive = (path: string) => ({ plugin: 'p', waiver: { rule: 'out-of-scope', path, reason: 'r' } });
    const one = applyWaivers(refused(true), [waive('lib/y.ts')], true);
    expect(one.blocking.map((f) => [f.rule, f.severity, f.message, f.paths])).toEqual([
      ['protected-file', 'error', 'the round changed src/a.ts, which this brief protects', undefined],
      ['protected-file', 'error', 'the round changed src/b.ts, which this brief protects', undefined],
      ['out-of-scope', 'error', 'the round changed 1 file(s) outside affectedFiles: lib/x.ts', ['lib/x.ts']],
    ]);
    const both = applyWaivers(refused(true), [waive('lib/y.ts'), waive('lib/x.ts')], true);
    expect(both.blocking.map((f) => f.rule)).toEqual(['protected-file', 'protected-file']);
    expect(both.warnings.map((f) => [f.rule, f.line, f.path])).toEqual([
      ['waived', 3, 'lib/y.ts'],
      ['waived', 3, 'lib/x.ts'],
    ]);
  });

  it('that matches nothing changes nothing, and a plan with every refusal waived may proceed', () => {
    const plan = refused();
    expect(applyWaivers(plan, [{ plugin: 'p', waiver: { rule: 'protected-file', path: 'src/c.ts', reason: 'r' } }])).toEqual(plan);
    // A warning is not a refusal: out-of-scope without --strict is left alone.
    expect(applyWaivers(plan, [{ plugin: 'p', waiver: { rule: 'out-of-scope', path: 'lib/x.ts', reason: 'r' } }])).toEqual(plan);
    const all = applyWaivers(plan, ['src/a.ts', 'src/b.ts'].map((path) => ({ plugin: 'p', waiver: { rule: 'protected-file', path, reason: 'r' } })));
    expect(all.blocking).toEqual([]);
  });

  it('for any other rule is ignored with a warning, which refuses under --strict', () => {
    const corpus = corpusOf({ [A]: goodBrief({ status: 'draft' }) });
    const plan = planArchive(corpus, corpus.briefs[0]!, { date: '2026-09-26' });
    const asked = [{ plugin: 'p', waiver: { rule: 'archive-draft', path: A, reason: 'r' } }];
    const lenient = applyWaivers(plan, asked);
    expect(lenient.blocking.map((f) => f.rule)).toEqual(['archive-draft']);
    expect(table(lenient.warnings)).toEqual([
      '1 warning waiver-ignored: p asked to waive archive-draft for briefs/001_a.md; a plugin may waive only protected-file, out-of-scope and scope-changed | report it to the plugin\'s authors: archive-draft is spec-brief\'s to decide',
    ]);
    const strict = applyWaivers(plan, asked, true);
    expect(strict.blocking.map((f) => [f.rule, f.severity])).toEqual([
      ['archive-draft', 'error'],
      ['waiver-ignored', 'error'],
    ]);
    expect(strict.warnings).toEqual([]);
  });
});

describe('a round that changed the scope it runs under', () => {
  const started = goodBrief({ affectedFiles: '[src/auth/**]', protectedFiles: '[src/db/schema.ts, docs/adr/**]' });
  const loosened = goodBrief({ affectedFiles: '[src/auth/**, src/api/**]', protectedFiles: '[docs/adr/**]' }, '\n- [x] a box ticked as the work landed\n');
  const BASE = '0123456789abcdef0123456789abcdef01234567';
  const HINT = (field: string, at = '0123456'): string =>
    `a round does not change the scope it runs under: restore ${field} as ${at} has it, or have the person who approved the brief rule on the change (spec-harness escalate)`;

  interface Options {
    readonly strict?: boolean;
    readonly rules?: Record<string, string>;
    readonly before?: string | null;
    readonly revision?: string;
    readonly paths?: readonly string[];
  }

  function plan(now: string, options: Options = {}): Plan {
    const corpus = corpusOf({ [A]: now }, options.rules === undefined ? undefined : config({ rules: options.rules }));
    const paths = options.paths ?? ['src/db/schema.ts', 'src/api/b.ts', 'src/auth/a.ts', 'lib/x.ts', A];
    return planArchive(corpus, corpus.briefs[0]!, {
      date: '2026-11-12',
      commit: COMMIT,
      changes: paths.map((path) => ({ path, insertions: 1, deletions: 0 })),
      strict: options.strict,
      before: { revision: options.revision ?? BASE, text: options.before === undefined ? started : options.before },
      repoFiles: ['src/db/schema.ts', 'src/auth/a.ts', 'src/api/b.ts', 'lib/x.ts', A],
    });
  }

  it('warns of each protection it dropped and each pattern it added, with the files they let through', () => {
    const p = plan(loosened);
    expect(p.blocking).toEqual([]);
    expect(table(p.warnings)).toEqual([
      '3 warning out-of-scope: the round changed 1 file(s) outside affectedFiles: lib/x.ts | widen affectedFiles if the scope was wrong, or say why in the summary',
      `4 warning scope-changed: protectedFiles no longer covers "src/db/schema.ts", as it did at 0123456, and the round changed src/db/schema.ts | ${HINT('protectedFiles')}`,
      `3 warning scope-changed: affectedFiles covers "src/api/**", which it did not at 0123456, and the round changed src/api/b.ts | ${HINT('affectedFiles')}`,
    ]);
    expect(p.warnings.slice(1).map((f) => [f.path, f.paths, f.subject])).toEqual([
      ['src/db/schema.ts', ['src/db/schema.ts'], 'protectedFiles: src/db/schema.ts'],
      ['src/api/**', ['src/api/b.ts'], 'affectedFiles: src/api/**'],
    ]);
    expect(findingJson(p.warnings[1]!)).toMatchObject({ rule: 'scope-changed', path: 'src/db/schema.ts', paths: ['src/db/schema.ts'] });
  });

  it('reports a file whose protection was dropped once, by the dropped protection, and not again as out of scope', () => {
    const outside = plan(loosened, { paths: ['src/db/schema.ts'] });
    expect(outside.warnings.map((f) => f.rule)).toEqual(['scope-changed', 'scope-changed']);
    // With the rule off, the file is out of scope as it was, so it is never left unreported.
    const off = plan(loosened, { paths: ['src/db/schema.ts'], rules: { 'scope-changed': 'off' } });
    expect(off.warnings.map((f) => [f.rule, f.paths])).toEqual([['out-of-scope', ['src/db/schema.ts']]]);
  });

  it('refuses under --strict, and where the configuration makes it an error', () => {
    expect(plan(loosened, { strict: true }).blocking.map((f) => [f.rule, f.severity])).toEqual([
      ['out-of-scope', 'error'],
      ['scope-changed', 'error'],
      ['scope-changed', 'error'],
    ]);
    expect(plan(loosened, { rules: { 'scope-changed': 'error' } }).blocking.map((f) => f.rule)).toEqual(['scope-changed', 'scope-changed']);
  });

  it('says nothing of ticks, ruling rows or any edit of the brief but its scope, nor of a scope narrowed', () => {
    const rulings = ['', '## Rulings', '', '| Ruling | Paths | Decision | Note |', '| --- | --- | --- | --- |', '| R-1 | `src/db/schema.ts` | allow | ok |'].join('\n');
    const edited = started.replace('The tree is better.', `The tree is better.\n${rulings}`);
    expect(plan(`${edited}\n- [x] another box\n`, { paths: ['src/auth/a.ts'] }).warnings).toEqual([]);
    const narrowed = goodBrief({ affectedFiles: '[src/auth/login.ts]', protectedFiles: '[docs/adr/**, src/db/**]' });
    expect(plan(narrowed, { paths: ['src/auth/login.ts'] }).warnings).toEqual([]);
  });

  it('says nothing of a brief the round wrote, or one the revision was not read for', () => {
    expect(plan(loosened, { before: null }).warnings.map((f) => f.rule)).toEqual(['out-of-scope']);
    const corpus = corpusOf({ [A]: loosened });
    const unread = planArchive(corpus, corpus.briefs[0]!, { date: '2026-11-12', commit: COMMIT, changes: [{ path: 'src/api/b.ts', insertions: 1, deletions: 0 }] });
    expect(unread.warnings).toEqual([]);
  });

  it('names a scope that no longer bounds the round, and the files it let through, and names the parent of a commit as such', () => {
    const unbounded = goodBrief({ protectedFiles: '[src/db/schema.ts, docs/adr/**]' });
    const p = plan(unbounded, { revision: `${'f'.repeat(40)}^`, paths: ['src/db/schema.ts', 'lib/x.ts', 'docs/adr/1.md'] });
    expect(table(p.warnings)).toEqual([
      `1 warning scope-changed: affectedFiles no longer bounds the round: it names no pattern that can be read, and named "src/auth/**" at fffffff^, and the round changed lib/x.ts | ${HINT('affectedFiles', 'fffffff^')}`,
    ]);
    expect(p.blocking.map((f) => [f.rule, f.path])).toEqual([
      ['protected-file', 'src/db/schema.ts'],
      ['protected-file', 'docs/adr/1.md'],
    ]);
    expect(p.warnings[0]?.path).toBe('**');
  });

  it('names the line of the field, and a change without files as the change alone', () => {
    const wide = goodBrief({ protectedFiles: '[docs/adr/**]', affectedFiles: '[src/auth/**, "src/{a,b}/**"]' });
    expect(plan(wide, { paths: [] }).warnings.map((f) => `${f.line} ${f.message}`)).toEqual([
      '3 protectedFiles no longer covers "src/db/schema.ts", as it did at 0123456',
      '4 affectedFiles covers "src/{a,b}/**", which it did not at 0123456',
    ]);
  });

  it('is waived by its pattern, whole, as a warning or as a refusal, and never by a file it let through', () => {
    const waive = (path: string) => ({ plugin: 'harness', waiver: { rule: 'scope-changed', path, reason: 'ruling R-1, signed by alice, allows it' } });
    const lenient = applyWaivers(plan(loosened), [waive('src/db/schema.ts')]);
    expect(lenient.warnings.map((f) => [f.rule, f.severity, f.path])).toEqual([
      ['out-of-scope', 'warning', undefined],
      ['scope-changed', 'warning', 'src/api/**'],
      ['waived', 'note', 'src/db/schema.ts'],
    ]);
    expect(lenient.warnings[2]?.message).toBe('harness waives scope-changed for src/db/schema.ts: ruling R-1, signed by alice, allows it');
    const strict = applyWaivers(plan(loosened, { strict: true }), [waive('src/api/**')], true);
    expect(strict.blocking.map((f) => [f.rule, f.path])).toEqual([
      ['out-of-scope', undefined],
      ['scope-changed', 'src/db/schema.ts'],
    ]);
    expect(strict.warnings.map((f) => [f.rule, f.path])).toEqual([['waived', 'src/api/**']]);
    // A file the change let through is not the change.
    const p = plan(loosened);
    expect(applyWaivers(p, [waive('src/api/b.ts')])).toEqual(p);
    // Nor is an out-of-scope warning a plugin's to lift.
    expect(applyWaivers(p, [{ plugin: 'p', waiver: { rule: 'out-of-scope', path: 'lib/x.ts', reason: 'r' } }])).toEqual(p);
  });
});
