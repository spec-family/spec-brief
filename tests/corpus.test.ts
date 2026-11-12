import { describe, expect, it } from 'vitest';

import { type Corpus, dependencyCycles, findBriefs, idKey, isReady, pendingDependencies, resolveDependency, waitingOnDeferred } from '../src/corpus.js';
import { collisionFindings, collisions, reported } from '../src/collisions.js';
import { config, corpusOf, goodBrief } from './helpers.js';
import { fastestInTurn, instrumented } from './timing.js';

// Every corpus is built inside its test: one built while the file loads is
// code Stryker measures against the whole suite (ADR-0009).

const archived = (front: Record<string, string> = {}): string => goodBrief({ status: 'archived', ...front });

describe('finding briefs', () => {
  const named = (): Corpus =>
    corpusOf({
      'briefs/034_a.md': goodBrief(),
      'briefs/archive/012_b.md': archived(),
      'briefs/B-7_c.md': goodBrief(),
    });

  it('by id, numerically for numbers, by file name and by path', () => {
    const corpus = named();
    expect(idKey('034')).toBe('34');
    expect(idKey('B-7')).toBe('B-7');
    expect(findBriefs(corpus, '34').map((b) => b.file)).toEqual(['briefs/034_a.md']);
    expect(findBriefs(corpus, ' 012 ').map((b) => b.file)).toEqual(['briefs/archive/012_b.md']);
    expect(findBriefs(corpus, 'B-7').map((b) => b.file)).toEqual(['briefs/B-7_c.md']);
    expect(findBriefs(corpus, '034_a.md').map((b) => b.file)).toEqual(['briefs/034_a.md']);
    expect(findBriefs(corpus, './briefs\\archive\\012_b.md').map((b) => b.file)).toEqual(['briefs/archive/012_b.md']);
    expect(findBriefs(corpus, 'nothing')).toEqual([]);
  });

  it('finds none for a path that leaves the repository', () => {
    expect(findBriefs(named(), '../briefs/034_a.md')).toEqual([]);
  });

  it('resolves a dependency to the live brief when an id is claimed twice', () => {
    const twice = corpusOf({ 'briefs/archive/005_old.md': archived(), 'briefs/005_new.md': goodBrief() });
    expect(resolveDependency(twice, '5')?.file).toBe('briefs/005_new.md');
    expect(resolveDependency(twice, '6')).toBeUndefined();
  });
});

describe('readiness', () => {
  const queue = (): { corpus: Corpus; get: (id: string) => Corpus['briefs'][number] } => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ dependsOn: '[002, 003]' }),
      'briefs/archive/002_b.md': archived(),
      'briefs/003_c.md': goodBrief(),
      'briefs/004_d.md': goodBrief({ dependsOn: '[002]' }),
      'briefs/005_e.md': goodBrief({ status: 'draft' }),
      'briefs/006_f.md': goodBrief({ dependsOn: '[999]' }),
    });
    return { corpus, get: (id) => findBriefs(corpus, id)[0]! };
  };

  it('waits on live dependencies and not on archived ones', () => {
    const { corpus, get } = queue();
    expect(pendingDependencies(corpus, get('001'))).toEqual(['003']);
    expect(pendingDependencies(corpus, get('004'))).toEqual([]);
    expect(pendingDependencies(corpus, get('006'))).toEqual([]);
  });

  it('is ready when every dependency is archived, never for a draft, an archived brief or an unknown dependency', () => {
    const { corpus, get } = queue();
    expect(isReady(corpus, get('001'))).toBe(false);
    expect(isReady(corpus, get('003'))).toBe(true);
    expect(isReady(corpus, get('004'))).toBe(true);
    expect(isReady(corpus, get('005'))).toBe(false);
    expect(isReady(corpus, get('002'))).toBe(false);
    expect(isReady(corpus, get('006'))).toBe(false);
  });
});

describe('waiting on deferred work', () => {
  it('holds a brief that depends on a deferred one and every brief behind it, by id, whichever is found first', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ dependsOn: '[002]' }),
      'briefs/002_b.md': goodBrief({ dependsOn: '[003]' }),
      'briefs/003_c.md': goodBrief({ status: 'deferred', trigger: 'when the second tenant signs' }),
      'briefs/004_d.md': goodBrief(),
    });
    expect(waitingOnDeferred(corpus).map((w) => [w.brief.id, w.waitsOn.id])).toEqual([
      ['001', '002'],
      ['002', '003'],
    ]);
  });

  it('lists a deferred brief as deferred, and never as waiting, whatever it depends on', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ status: 'deferred', trigger: 'when the second tenant signs' }),
      'briefs/002_b.md': goodBrief({ status: 'deferred', trigger: 'when the third signs', dependsOn: '[001, 003]' }),
      'briefs/003_c.md': goodBrief({ dependsOn: '[001]' }),
    });
    expect(waitingOnDeferred(corpus).map((w) => [w.brief.id, w.waitsOn.id])).toEqual([['003', '001']]);
    const report = collisions(corpus);
    expect(report.deferred.map((b) => b.id)).toEqual(['001', '002']);
    expect(report.waiting.map((w) => w.brief.id)).toEqual(['003']);
  });
});

describe('cycles', () => {
  it('finds each strongly connected component once, as a shortest path from its first brief', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ dependsOn: '[002]' }),
      'briefs/002_b.md': goodBrief({ dependsOn: '[001, 003]' }),
      'briefs/003_c.md': goodBrief({ dependsOn: '[001]' }),
      'briefs/004_d.md': goodBrief({ dependsOn: '[005]' }),
      'briefs/005_e.md': goodBrief({ dependsOn: '[004]' }),
      'briefs/006_f.md': goodBrief({ dependsOn: '[006]' }),
    });
    expect(dependencyCycles(corpus).map((c) => c.map((b) => b.id))).toEqual([
      ['001', '002', '001'],
      ['004', '005', '004'],
    ]);
  });

  it('starts from the first brief by path whatever order the search visits them in', () => {
    const corpus = corpusOf({
      'briefs/009_z.md': goodBrief({ dependsOn: '[003]' }),
      'briefs/003_a.md': goodBrief({ dependsOn: '[007]' }),
      'briefs/007_m.md': goodBrief({ dependsOn: '[009]' }),
    });
    expect(dependencyCycles(corpus).map((c) => c.map((b) => b.id))).toEqual([['003', '007', '009', '003']]);
  });

  it('starts from the first brief by path where the search comes into the cycle at another', () => {
    // 001 is searched first and depends on 005, so the cycle of 004 and 005
    // is met at 005. The brief a search came in by is where a component
    // read backwards starts, which for every other cycle here is its first
    // by path too.
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ dependsOn: '[005]' }),
      'briefs/004_d.md': goodBrief({ dependsOn: '[005]' }),
      'briefs/005_e.md': goodBrief({ dependsOn: '[004]' }),
    });
    expect(dependencyCycles(corpus).map((c) => c.map((b) => b.id))).toEqual([['004', '005', '004']]);
  });

  it('follows the dependencies that lead back, past an archived one and past live ones that lead nowhere', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ dependsOn: '[900, 004, 002]' }),
      'briefs/002_b.md': goodBrief({ dependsOn: '[004, 003]' }),
      'briefs/003_c.md': goodBrief({ dependsOn: '[900, 001]' }),
      'briefs/004_d.md': goodBrief({ dependsOn: '[005]' }),
      'briefs/005_e.md': goodBrief(),
      // Done, so no part of a cycle, though it names a brief in one.
      'briefs/archive/900_z.md': archived({ dependsOn: '[001]' }),
    });
    expect(dependencyCycles(corpus).map((c) => c.map((b) => b.id))).toEqual([['001', '002', '003', '001']]);
  });
});

describe('the collision matrix', () => {
  const waves = (): Corpus =>
    corpusOf({
      'briefs/001_a.md': goodBrief({ wave: '1', affectedFiles: '[src/auth/**]' }),
      'briefs/002_b.md': goodBrief({ wave: '1', affectedFiles: '["src/**/session.ts", src/api/users.ts]' }),
      'briefs/003_c.md': goodBrief({ wave: '1', affectedFiles: '[src/api/orders.ts]' }),
      'briefs/004_d.md': goodBrief({ wave: '1' }),
      'briefs/005_e.md': goodBrief({ wave: '2', affectedFiles: '[src/auth/**]' }),
      'briefs/006_f.md': goodBrief({ affectedFiles: '[src/auth/**]' }),
      'briefs/archive/007_g.md': archived({ wave: '1', affectedFiles: '[src/auth/**]' }),
    });

  it('compares live briefs wave by wave and names a file both scopes cover', () => {
    const report = collisions(waves());
    expect(report.waves.map((w) => [w.wave, w.briefs.map((b) => b.id)])).toEqual([
      [1, ['001', '002', '003', '004']],
      [2, ['005']],
    ]);
    const wave1 = report.waves[0]!;
    expect(wave1.collisions.map((c) => [c.a.id, c.b.id, c.overlaps])).toEqual([
      ['001', '002', [{ patterns: ['src/auth/**', 'src/**/session.ts'], witness: 'src/auth/session.ts', inTree: null }]],
    ]);
    expect(wave1.shared.map((s) => [s.a.id, s.b.id, s.directories])).toEqual([['002', '003', ['src/api']]]);
    expect(wave1.unscoped.map((b) => b.id)).toEqual(['004']);
    expect(report.waves[1]?.unscoped).toEqual([]);
    expect(report.unscheduled.map((b) => b.id)).toEqual(['006']);
  });

  it('warns of a brief that may write what another brief of its wave protects, on the writer, either way round', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ wave: '1', affectedFiles: '[src/domain/refund.ts, src/api/**]' }),
      'briefs/002_b.md': goodBrief({ wave: '1', affectedFiles: '[lib/**]', protectedFiles: '[src/domain/**, src/api/schema.ts]' }),
      'briefs/003_c.md': goodBrief({ wave: '1', affectedFiles: '[docs/**]', protectedFiles: '[lib/x.ts]' }),
      // Another wave writes the same and is not asked.
      'briefs/004_d.md': goodBrief({ wave: '2', affectedFiles: '[src/domain/**]' }),
    });
    const report = collisions(corpus, { repoFiles: ['src/api/schema.ts', 'lib/x.ts'] });
    expect(report.waves[0]?.intrusions.map((i) => [i.writer.id, i.owner.id, i.overlaps, i.undecided])).toEqual([
      [
        '001',
        '002',
        [
          { patterns: ['src/domain/refund.ts', 'src/domain/**'], witness: 'src/domain/refund.ts', inTree: false },
          { patterns: ['src/api/**', 'src/api/schema.ts'], witness: 'src/api/schema.ts', inTree: true },
        ],
        [],
      ],
      ['002', '003', [{ patterns: ['lib/**', 'lib/x.ts'], witness: 'lib/x.ts', inTree: true }], []],
    ]);
    expect(report.waves[1]?.intrusions).toEqual([]);
    const found = collisionFindings(corpus, report).filter((f) => f.rule === 'writes-protected');
    expect(found.map((f) => [f.severity, f.file, f.line, f.brief, f.subject, f.message, f.hint])).toEqual([
      [
        'warning',
        'briefs/001_a.md',
        4,
        '001',
        '002',
        'may write what 002 protects in wave 1: "src/domain/refund.ts" reaches "src/domain/**" at src/domain/refund.ts, an example not in the tree; "src/api/**" reaches "src/api/schema.ts" at src/api/schema.ts',
        'run them in different waves, make one depend on the other, or narrow affectedFiles to leave what 002 protects alone',
      ],
      [
        'warning',
        'briefs/002_b.md',
        4,
        '002',
        '003',
        'may write what 003 protects in wave 1: "lib/**" reaches "lib/x.ts" at lib/x.ts',
        'run them in different waves, make one depend on the other, or narrow affectedFiles to leave what 003 protects alone',
      ],
    ]);
    // Off, it is not reported, and the report told leaves it out.
    const off = corpusOf(Object.fromEntries(corpus.briefs.map((b) => [b.file, b.source])), config({ rules: { 'writes-protected': 'off' } }));
    expect(collisionFindings(off, collisions(off)).filter((f) => f.rule === 'writes-protected')).toEqual([]);
    expect(reported(off, collisions(off)).waves[0]?.intrusions).toEqual([]);
  });

  it('does not warn of a file the writer itself protects, nor of a protection nothing it writes can reach', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ wave: '1', affectedFiles: '[src/**]', protectedFiles: '[src/db/**]' }),
      'briefs/002_b.md': goodBrief({ wave: '1', affectedFiles: '[lib/**]', protectedFiles: '[src/db/schema.ts, docs/**]' }),
    });
    expect(collisions(corpus).waves[0]?.intrusions).toEqual([]);
  });

  it('says a pair it could not decide is undecided, beside what it did decide', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ wave: '1', affectedFiles: '["src/*/a/**"]' }),
      'briefs/002_b.md': goodBrief({ wave: '1', affectedFiles: '[lib/**]', protectedFiles: '["src/x*/**"]' }),
    });
    const hurried = collisions(corpus, { budget: 1 });
    expect(hurried.waves[0]?.intrusions.map((i) => [i.overlaps, i.undecided])).toEqual([[[], [['src/*/a/**', 'src/x*/**']]]]);
    expect(collisionFindings(corpus, hurried).map((f) => f.message)).toEqual([
      'whether it writes what 002 protects in wave 1 is undecided: the search met its budget for "src/*/a/**" and "src/x*/**"',
    ]);
    // Given its budget, the search decides it: the two meet, at a path it built, with no tree to ask.
    expect(collisions(corpus).waves[0]?.intrusions.map((i) => [i.overlaps.map((o) => o.inTree), i.undecided])).toEqual([[[null], []]]);
    // A pair decided and one not, told in one finding.
    const wave = hurried.waves[0]!;
    const both = { ...wave, intrusions: [{ ...wave.intrusions[0]!, overlaps: [{ patterns: ['src/b.ts', 'src/b.ts'] as const, witness: 'src/b.ts', inTree: null }] }] };
    expect(collisionFindings(corpus, { ...hurried, waves: [both] }).map((f) => f.message)).toEqual([
      'may write what 002 protects in wave 1: "src/b.ts" reaches "src/b.ts" at src/b.ts, and is undecided for "src/*/a/**" and "src/x*/**"',
    ]);
  });

  it('skips patterns that do not parse', () => {
    const bad = corpusOf({
      'briefs/001_a.md': goodBrief({ wave: '1', affectedFiles: '["/abs", src/**]' }),
      'briefs/002_b.md': goodBrief({ wave: '1', affectedFiles: '[src/x]' }),
    });
    expect(collisions(bad).waves[0]?.collisions.flatMap((c) => c.overlaps.map((o) => o.patterns))).toEqual([['src/**', 'src/x']]);
  });

  it('compares across waves when asked', () => {
    const report = collisions(waves(), { all: true });
    expect(report.waves).toHaveLength(1);
    expect(report.waves[0]?.wave).toBeNull();
    expect(report.unscheduled).toEqual([]);
    const pairs = report.waves[0]!.collisions.map((c) => `${c.a.id}-${c.b.id}`);
    expect(pairs).toEqual(['001-002', '001-005', '001-006', '002-005', '002-006', '005-006']);
  });

  it('compares two briefs of many patterns in time that grows with the pairs, not with the protections as well', async () => {
    // Each pattern its own directory, and a protection for every fourth: no
    // pair meets. Every pair was searched with every protection in it, so
    // twice the patterns took over eight times as long; two briefs of 200
    // took 17 seconds, and of 400 more than two minutes.
    const wave = (count: number): Corpus =>
      corpusOf(
        Object.fromEntries(
          [1, 2].map((b) => {
            const affected = Array.from({ length: count }, (_, i) => `src/b${b}/m${i}/**`).join(', ');
            const kept = Array.from({ length: count / 4 }, (_, i) => `src/b${b}/m${i}/keep.ts`).join(', ');
            return [`briefs/00${b}_x.md`, goodBrief({ wave: '1', affectedFiles: `[${affected}]`, protectedFiles: `[${kept}]` })];
          }),
        ),
      );
    const [small, large] = [wave(100), wave(200)];
    expect(collisionFindings(large, collisions(large))).toEqual([]);
    // Names under "**/" fix no directory, and their last names tell them apart.
    const named = corpusOf({
      'briefs/001_x.md': goodBrief({ wave: '1', affectedFiles: `[${Array.from({ length: 60 }, (_, i) => `"**/a${i}.ts"`).join(', ')}]` }),
      'briefs/002_x.md': goodBrief({ wave: '1', affectedFiles: `[${Array.from({ length: 60 }, (_, i) => `"**/*.b${i}"`).join(', ')}]` }),
    });
    expect(collisionFindings(named, collisions(named))).toEqual([]);
    if (instrumented()) return;
    // Doubled, the pairs are four times as many. Five times is allowed, and 100 ms for noise.
    const [one, other] = (await fastestInTurn(3, () => collisions(small), () => collisions(large))) as [number, number];
    expect(other).toBeLessThan(5 * one + 100);
  });

  it('tells a brief whose patterns cannot be read why it is unscoped, and does not tell it it declares none', () => {
    const corpus = corpusOf({
      'briefs/001_a.md': goodBrief({ wave: '1', affectedFiles: '[src/a.ts]' }),
      'briefs/002_b.md': goodBrief({ wave: '1', affectedFiles: '[src/../src/loans.js, "!src/loans.js"]' }),
    });
    const found = collisionFindings(corpus, collisions(corpus));
    expect(found.map((f) => [f.rule, f.line, f.message, f.hint])).toEqual([
      [
        'unscoped',
        4,
        'has no pattern in affectedFiles that can be read, "src/../src/loans.js" and "!src/loans.js", so it cannot be checked against the 1 other brief(s) in wave 1',
        'fix the patterns as spec-brief lint says under "glob"',
      ],
    ]);
  });

  it('reports collisions as errors, unscoped briefs as notes, and shared directories only when switched on', () => {
    const corpus = waves();
    const found = collisionFindings(corpus, collisions(corpus));
    expect(found.map((f) => [f.rule, f.severity, f.file, f.line])).toEqual([
      ['collision', 'error', 'briefs/002_b.md', 4],
      ['unscoped', 'note', 'briefs/004_d.md', 1],
    ]);
    expect(found[0]?.message).toBe('"src/**/session.ts" overlaps 001\'s "src/auth/**" in wave 1; both cover src/auth/session.ts');
    expect(found[1]?.message).toBe('declares no affectedFiles, so it cannot be checked against the 3 other brief(s) in wave 1');

    const loud = corpusOf(
      Object.fromEntries(corpus.briefs.map((b) => [b.file, b.source])),
      config({ rules: { 'shared-directory': 'warning', unscoped: 'off', collision: 'warning' } }),
    );
    const again = collisionFindings(loud, collisions(loud));
    expect(again.map((f) => [f.rule, f.severity])).toEqual([
      ['collision', 'warning'],
      ['shared-directory', 'warning'],
    ]);
    expect(again[1]?.message).toBe('writes into src/api/, as 002 does in wave 1');
    const everything = collisionFindings(loud, collisions(loud, { all: true }));
    expect(everything[0]?.message).toContain('among the live briefs');
  });
});
