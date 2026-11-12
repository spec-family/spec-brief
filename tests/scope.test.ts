import { describe, expect, it } from 'vitest';

import { type Glob, matchGlob, parseGlob, readingIn } from '../src/glob.js';
import { apart, contradictions, meet, patternsOf, type Scope, scopeChanges, scopeOf } from '../src/scope.js';
import { brief, goodBrief } from './helpers.js';

/**
 * A brief writes its affectedFiles less its protectedFiles, and two briefs
 * collide where those meet. Checked here against brute force: every path of a
 * small alphabet, matched pattern by pattern, decides what the witness search
 * must find.
 */

const file = readingIn(null);

function scope(affected: readonly string[], protectedFiles: readonly string[] = []): Scope {
  const text = goodBrief({ affectedFiles: JSON.stringify(affected), protectedFiles: JSON.stringify(protectedFiles) });
  return scopeOf(brief(text), file);
}

describe('a scope', () => {
  it('keeps the patterns that parse, in order, and leaves the rest to the glob rule', () => {
    expect(patternsOf(['src/**', '/abs', 'a{', 'docs/*.md'], file).map((p) => p.pattern)).toEqual(['src/**', 'docs/*.md']);
    const s = scope(['src/**'], ['src/db.ts', '!x']);
    expect(s.affected.map((p) => p.pattern)).toEqual(['src/**']);
    expect(s.protected.map((p) => p.pattern)).toEqual(['src/db.ts']);
  });

  it('reads its literals the way it is told', () => {
    const tree = readingIn(['build/out.js']);
    const s = scopeOf(brief(goodBrief({ affectedFiles: '[build]' })), tree);
    expect(s.affected[0]?.glob.literals).toEqual([{ path: 'build', reading: 'directory' }]);
  });
});

describe('two scopes meeting', () => {
  it('meet where both may write, every pair of patterns listed', () => {
    const meeting = meet(scope(['src/**', 'docs/*.md']), scope(['src/a/*.ts', 'docs/x.md', 'lib/**']));
    expect(meeting).toEqual({
      overlaps: [
        { patterns: ['src/**', 'src/a/*.ts'], witness: 'src/a/.ts', inTree: null },
        { patterns: ['docs/*.md', 'docs/x.md'], witness: 'docs/x.md', inTree: null },
      ],
      undecided: [],
    });
  });

  it('do not meet on a file either one protects', () => {
    const schema = ['src/db/schema.ts'];
    expect(meet(scope(['src/db/schema.ts']), scope(['src/db/*.ts'], schema)).overlaps).toEqual([]);
    expect(meet(scope(['src/db/schema.ts'], schema), scope(['src/db/*.ts'])).overlaps).toEqual([]);
    // What the protection leaves is still shared.
    expect(meet(scope(['src/db/**'], schema), scope(['src/db/*.ts'])).overlaps.map((o) => o.witness)).toEqual(['src/db/.ts']);
  });

  it('say which pairs the search could not decide', () => {
    expect(meet(scope(['src/**']), scope(['**/*.ts']), 1)).toEqual({ overlaps: [], undecided: [['src/**', '**/*.ts']] });
  });

  it('name a file the tree holds, and the path the search built only as an example', () => {
    const shop = scope(['src/Shop.Application/**']);
    const service = scope(['**/OrderService.cs']);
    const tree = ['README.md', 'src/Shop.Application/Orders/OrderService.cs', 'src/Shop.Application/Payments/OrderService.cs'];
    // The search's shortest path is not a file here; the first file of the tree both match is.
    expect(meet(shop, service, undefined, tree).overlaps).toEqual([
      { patterns: ['src/Shop.Application/**', '**/OrderService.cs'], witness: 'src/Shop.Application/Orders/OrderService.cs', inTree: true },
    ]);
    // A tree with no file both match, outside the protections, leaves the search's path, said to be an example.
    const example = { patterns: ['src/Shop.Application/**', '**/OrderService.cs'], witness: 'src/Shop.Application/OrderService.cs', inTree: false };
    expect(meet(shop, service, undefined, ['src/Shop.Application/Orders/Order.cs', 'lib/OrderService.cs']).overlaps).toEqual([example]);
    expect(meet(scope(['src/Shop.Application/**'], ['src/Shop.Application/*/**']), service, undefined, tree).overlaps).toEqual([example]);
    expect(meet(shop, scope(['**/OrderService.cs'], ['src/Shop.Application/*/**']), undefined, tree).overlaps).toEqual([example]);
    // With no tree, nothing is said of where the path is.
    expect(meet(shop, service).overlaps).toEqual([{ ...example, inTree: null }]);
  });

  it('settle a pair the search could not decide with a file both may write, and only with one', () => {
    const [x, y] = [scope(['src/**']), scope(['**/*.ts'])];
    expect(meet(x, y, 1, ['docs/a.md', 'src/a.ts'])).toEqual({ overlaps: [{ patterns: ['src/**', '**/*.ts'], witness: 'src/a.ts', inTree: true }], undecided: [] });
    expect(meet(x, y, 1, ['docs/a.ts', 'src/a.md'])).toEqual({ overlaps: [], undecided: [['src/**', '**/*.ts']] });
    expect(meet(scope(['src/**'], ['src/a.ts']), y, 1, ['src/a.ts'])).toEqual({ overlaps: [], undecided: [['src/**', '**/*.ts']] });
    // A pair the search proves apart stays apart, whatever the tree holds.
    expect(meet(scope(['src/**']), scope(['docs/**']), undefined, ['src/a.ts', 'docs/a.md'])).toEqual({ overlaps: [], undecided: [] });
  });

  it('agree with brute force over a generated corpus of scopes', () => {
    let seed = 20260926;
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const atoms = ['a', 'b', '*', '?', '[ab]'];
    const segment = (): string => (random(5) === 0 ? '**' : Array.from({ length: 1 + random(2) }, () => atoms[random(atoms.length)] as string).join(''));
    const pattern = (): string => Array.from({ length: 1 + random(3) }, segment).join('/');
    const patterns = (most: number): string[] => Array.from({ length: random(most + 1) }, pattern);
    const names = ['a', 'b', 'aa', 'ab', 'ba', 'bb'];
    const paths: string[] = [];
    const build = (prefix: string[], depth: number): void => {
      if (prefix.length > 0) paths.push(prefix.join('/'));
      if (depth > 0) for (const name of names) build([...prefix, name], depth - 1);
    };
    build([], 3);
    const any = (globs: readonly Glob[], path: string): boolean => globs.some((g) => matchGlob(g, path));
    const globs = (list: readonly string[]): Glob[] =>
      list.map((p) => {
        const parsed = parseGlob(p);
        if (!parsed.ok) throw new Error(parsed.error);
        return parsed.glob;
      });

    // A tree of some of those paths, sorted as the engine's list is.
    const tree = paths.filter((_, i) => i % 7 === 3).sort();

    const seen = { met: 0, apart: 0, covered: 0 };
    const read = { held: 0, example: 0, settled: 0, undecided: 0 };
    for (let i = 0; i < 120; i += 1) {
      const a = { affected: [pattern()], protected: patterns(2) };
      const b = { affected: [pattern()], protected: patterns(1) };
      const meeting = meet(scope(a.affected, a.protected), scope(b.affected, b.protected));
      const avoid = globs([...a.protected, ...b.protected]);
      const [x, y] = [globs(a.affected)[0] as Glob, globs(b.affected)[0] as Glob];
      const label = `${a.affected[0]} less ${a.protected.join(',')} / ${b.affected[0]} less ${b.protected.join(',')}`;
      expect(meeting.undecided, label).toEqual([]);
      for (const { witness } of meeting.overlaps) {
        expect(matchGlob(x, witness) && matchGlob(y, witness) && !any(avoid, witness), `${label}: ${witness}`).toBe(true);
      }
      // Brute force sees only short paths: it can miss a meeting, never invent one.
      if (paths.some((p) => matchGlob(x, p) && matchGlob(y, p) && !any(avoid, p))) expect(meeting.overlaps, label).toHaveLength(1);

      // With a tree, the witness is its first file both may write, or the search's path as an example.
      const held = tree.find((p) => matchGlob(x, p) && matchGlob(y, p) && !any(avoid, p));
      const patternPair = [a.affected[0], b.affected[0]];
      const withTree = meet(scope(a.affected, a.protected), scope(b.affected, b.protected), undefined, tree);
      if (held !== undefined) expect(withTree, label).toEqual({ overlaps: [{ patterns: patternPair, witness: held, inTree: true }], undecided: [] });
      else expect(withTree, label).toEqual({ overlaps: meeting.overlaps.map((o) => ({ ...o, inTree: false })), undecided: [] });
      read.held += held === undefined ? 0 : 1;
      read.example += held === undefined ? meeting.overlaps.length : 0;
      // Given one state, the search decides little, and a file of the tree decides a pair alone.
      const hurried = meet(scope(a.affected, a.protected), scope(b.affected, b.protected), 1, tree);
      if (held !== undefined) expect(hurried, label).toEqual({ overlaps: [{ patterns: patternPair, witness: held, inTree: true }], undecided: [] });
      else expect(hurried.overlaps.every((o) => o.inTree === false), label).toBe(true);
      read.settled += held !== undefined && meet(scope(a.affected, a.protected), scope(b.affected, b.protected), 1).undecided.length > 0 ? 1 : 0;
      read.undecided += hurried.undecided.length;

      const own = scope(a.affected, a.protected);
      const covered = contradictions(own).covered.length > 0;
      const writable = paths.some((p) => matchGlob(x, p) && !any(globs(a.protected), p));
      if (writable) expect(covered, `${label}: writable, so not covered`).toBe(false);
      seen.met += meeting.overlaps.length;
      seen.apart += 1 - meeting.overlaps.length;
      seen.covered += covered ? 1 : 0;
    }
    // The corpus reaches every answer, not only the easy one.
    expect(seen).toEqual({ met: 59, apart: 61, covered: 29 });
    // Five pairs a search of one state cannot decide are proved apart by what their patterns fix.
    expect(read).toEqual({ held: 29, example: 30, settled: 29, undecided: 81 });
  });
});

describe('two patterns proved apart without a search', () => {
  it('never says two patterns are apart when brute force finds a path both match', () => {
    let seed = 20261112;
    // The high bits: the low bits of this generator repeat within a few draws.
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % n;
    };
    const atoms = ['a', 'b', 'x', 'a', 'b', 'x', 'ab', '*', '?', '[ab]', '{a,bx}', '{x,}'];
    const name = (): string => Array.from({ length: 1 + random(2) }, () => atoms[random(atoms.length)] as string).join('');
    const segment = (): string => (random(10) === 0 ? '**' : name());
    const tails = ['', '', '', '', '', '', '/', '/**'];
    const pattern = (): string => {
      const body = Array.from({ length: 1 + random(3) }, segment).join('/');
      // A brace whose alternatives end in different directories, now and then.
      return random(8) === 0 ? `{a/${body},b}` : `${body}${tails[random(tails.length)] as string}`;
    };
    const names = ['a', 'b', 'x', 'ab', 'ax', 'bx', 'xa', 'abx'];
    const paths: string[] = [];
    const build = (prefix: string[], depth: number): void => {
      if (prefix.length > 0) paths.push(prefix.join('/'));
      if (depth > 0) for (const n of names) build([...prefix, n], depth - 1);
    };
    build([], 3);
    // Literals read as the tree has them: some as files, some as directories.
    const reading = readingIn(paths.filter((_, i) => i % 5 === 1));
    const seen = { apart: 0, unproved: 0, sharing: 0 };
    for (let i = 0; i < 1500; i += 1) {
      const [px, py] = [pattern(), pattern()];
      const [x, y] = [parseGlob(px, { literal: reading }), parseGlob(py, { literal: reading })];
      if (!x.ok || !y.ok) continue;
      const shared = paths.find((p) => matchGlob(x.glob, p) && matchGlob(y.glob, p));
      const proved = apart(x.glob, y.glob);
      if (shared !== undefined) expect(proved, `${px} and ${py} both match ${shared}`).toBe(false);
      seen.apart += proved ? 1 : 0;
      seen.sharing += shared === undefined ? 0 : 1;
      seen.unproved += !proved && shared === undefined ? 1 : 0;
    }
    // The corpus reaches every answer: pairs proved apart, pairs that share a path, and pairs left to the search.
    expect(seen).toEqual({ apart: 462, unproved: 660, sharing: 265 });
  });

  it('proves apart by the directories a pattern lies under and by how its last name starts and ends, and by nothing else', () => {
    const g = (source: string, literal: 'file' | 'directory' = 'file'): Glob => {
      const parsed = parseGlob(source, { literal });
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.glob;
    };
    const proved = (x: string, y: string): boolean => apart(g(x), g(y));
    expect(proved('src/a/**', 'src/b/**')).toBe(true);
    expect(proved('src/a/**', 'src/**/x.ts')).toBe(false);
    expect(proved('**/a.ts', '**/b.ts')).toBe(true);
    expect(proved('**/*.a1', '**/*.b2')).toBe(true);
    expect(proved('**/x*.ts', '**/y*.ts')).toBe(true);
    expect(proved('**/x*.ts', '**/xy*.ts')).toBe(false);
    expect(proved('**/*.ts', '**/a.ts')).toBe(false);
    expect(proved('**/{a,b}.ts', '**/c.md')).toBe(true);
    expect(proved('**/{a,b}.ts', '**/a.ts')).toBe(false);
    // A last name left open: a directory, a brace across directories, a trailing slash, an escape.
    expect(apart(g('src/a.ts', 'directory'), g('**/b.ts'))).toBe(false);
    expect(proved('{a/x.ts,y}', '**/y')).toBe(false);
    expect(proved('src/', '**/b.ts')).toBe(false);
    expect(proved('src/**', '**/b.ts')).toBe(false);
    expect(proved('src/a\\*.ts', '**/b.ts')).toBe(false);
    // A pattern as written, spaces around it, is the pattern the parse read.
    expect(proved(' **/a.ts ', '**/a.ts')).toBe(false);
    expect(proved('**/x*y*.ts ', '**/xay.ts')).toBe(false);
  });
});

describe('a scope against its own protections', () => {
  it('names every affected pattern the protections cover, alone or together', () => {
    const s = scope(['src/db/**', 'src/**', 'docs/{a,b}.md', 'lib/x.ts'], ['src/db/**', 'docs/a.md', 'docs/b.md']);
    expect(contradictions(s)).toEqual({ covered: ['src/db/**', 'docs/{a,b}.md'], undecided: [] });
  });

  it('has nothing to say about a scope that protects nothing', () => {
    expect(contradictions(scope(['src/**']))).toEqual({ covered: [], undecided: [] });
    expect(contradictions(scope(['src/**'], ['**']), 1)).toEqual({ covered: [], undecided: ['src/**'] });
  });
});

describe('a scope against itself as the round found it', () => {
  it('names each protection dropped and each affected pattern added, and nothing else', () => {
    const before = scope(['src/auth/**'], ['src/db/schema.ts', 'docs/adr/**']);
    expect(scopeChanges(before, scope(['src/auth/**', 'src/api/**'], ['docs/adr/**']))).toEqual([
      { field: 'protectedFiles', pattern: 'src/db/schema.ts', undecided: false },
      { field: 'affectedFiles', pattern: 'src/api/**', undecided: false },
    ]);
    // Narrowed, reordered or rewritten to say the same, the scope did not grow.
    expect(scopeChanges(before, scope(['src/auth/login.ts'], ['docs/adr/**', 'src/db/schema.ts', 'src/db/**']))).toEqual([]);
    expect(scopeChanges(before, scope(['src/auth/{a,b}/**', 'src/auth/*'], ['src/db/schema.ts', 'docs/adr/', 'docs/adr/**']))).toEqual([]);
    expect(scopeChanges(scope(['src/**']), scope(['src/a/**', 'src/b.ts']))).toEqual([]);
  });

  it('counts a protection only partly kept as dropped', () => {
    expect(scopeChanges(scope([], ['src/db/**']), scope([], ['src/db/schema.ts']))).toEqual([{ field: 'protectedFiles', pattern: 'src/db/**', undecided: false }]);
    expect(scopeChanges(scope(['src/a/**']), scope(['src/**']))).toEqual([{ field: 'affectedFiles', pattern: 'src/**', undecided: false }]);
  });

  it('reads an affected list that empties as one that bounds nothing, and one that was empty as unbounded already', () => {
    expect(scopeChanges(scope(['src/a/**', 'src/b.ts']), scope([]))).toEqual([{ field: 'affectedFiles', pattern: '**', undecided: false }]);
    expect(scopeChanges(scope([]), scope(['src/**']))).toEqual([]);
    expect(scopeChanges(scope([]), scope([]))).toEqual([]);
  });

  it('reads a pattern that does not parse as none, on either side', () => {
    // A protection rewritten so that it cannot be read protects nothing.
    expect(scopeChanges(scope([], ['src/db/**']), scope([], ['/src/db/**']))).toEqual([{ field: 'protectedFiles', pattern: 'src/db/**', undecided: false }]);
    expect(scopeChanges(scope(['src/**']), scope(['/abs']))).toEqual([{ field: 'affectedFiles', pattern: '**', undecided: false }]);
    // One that could not be read when the round started protected nothing to drop.
    expect(scopeChanges(scope([], ['/src/db/**']), scope([], []))).toEqual([]);
  });

  it('reads a literal as the tree reads it, so a directory written with its slash is the same protection', () => {
    const tree = readingIn(['src/db/schema.ts']);
    const of = (protectedFiles: string[]): Scope => scopeOf(brief(goodBrief({ protectedFiles: JSON.stringify(protectedFiles) })), tree);
    expect(scopeChanges(of(['src/db']), of(['src/db/']))).toEqual([]);
    expect(scopeChanges(of(['src/db/schema.ts']), of(['src/db/schema.ts/']))).toEqual([{ field: 'protectedFiles', pattern: 'src/db/schema.ts', undecided: false }]);
  });

  it('says which it could not decide within its budget, and decides none of them by a guess', () => {
    expect(scopeChanges(scope([], ['src/**']), scope([], ['**']), 1)).toEqual([{ field: 'protectedFiles', pattern: 'src/**', undecided: true }]);
    expect(scopeChanges(scope(['**']), scope(['src/**']), 1)).toEqual([{ field: 'affectedFiles', pattern: 'src/**', undecided: true }]);
  });
});
