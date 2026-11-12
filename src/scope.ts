/**
 * A brief's scope, and whether two briefs can write the same file.
 *
 * What a brief may write is its `affectedFiles` less its `protectedFiles`:
 * protection wins, so "all of `src/` but the schema" is written
 * `affectedFiles: [src/**]` with `protectedFiles: [src/db/schema.ts]`. Two
 * briefs meet when some file lies in both writable scopes - in a pattern of
 * each, and in neither brief's protections - and the witness is such a file
 * the tree holds, or else the shortest such path the search builds, as an
 * example (ADR-0005).
 */

import type { Brief } from './brief.js';
import { filesMatching, type Glob, globBases, globCovers, globWitness, type LiteralReading, matchGlob, parseGlob, WITNESS_BUDGET } from './glob.js';

/** How a literal path is read, as {@link readingIn} answers for a tree. */
export type Reading = (path: string) => LiteralReading;

export interface ScopePattern {
  readonly pattern: string;
  readonly glob: Glob;
}

export interface Scope {
  readonly brief: Brief;
  /** The `affectedFiles` that parse. One that does not is the `glob` rule's finding, and scopes nothing. */
  readonly affected: readonly ScopePattern[];
  readonly protected: readonly ScopePattern[];
}

/** Patterns that parse, read with one reading. */
export function patternsOf(patterns: readonly string[], reading: Reading): ScopePattern[] {
  return patterns.flatMap((pattern) => {
    const parsed = parseGlob(pattern, { literal: reading });
    return parsed.ok ? [{ pattern, glob: parsed.glob }] : [];
  });
}

export function scopeOf(brief: Brief, reading: Reading): Scope {
  return { brief, affected: patternsOf(brief.affectedFiles, reading), protected: patternsOf(brief.protectedFiles, reading) };
}

/** A pattern from each scope, and a file both may write. */
export interface Overlap {
  readonly patterns: readonly [string, string];
  readonly witness: string;
  /**
   * `true` when the witness is a file the tree holds; `false` when the tree
   * holds none both patterns match outside the protections, and the witness
   * is an example the search built; `null` when no tree was given.
   */
  readonly inTree: boolean | null;
}

export interface Meeting {
  /** Every pair of patterns that meets outside both protections, the first scope's pattern first. */
  readonly overlaps: readonly Overlap[];
  /** Pairs of patterns the search could not decide within its budget, and no file of the tree decides. */
  readonly undecided: readonly (readonly [string, string])[];
}

const matched = new WeakMap<readonly string[], WeakMap<Glob, ReadonlySet<string>>>();

/**
 * The files of a tree a pattern matches, in the tree's order. Found once per
 * pattern and tree, which every pair a brief is in shares; kept or not, the
 * answer is the same, and only the time differs.
 */
function matching(files: readonly string[], glob: Glob): ReadonlySet<string> {
  let byGlob = matched.get(files);
  if (byGlob === undefined) {
    byGlob = new WeakMap();
    matched.set(files, byGlob);
  }
  let found = byGlob.get(glob);
  if (found === undefined) {
    found = new Set(filesMatching(glob, files));
    byGlob.set(glob, found);
  }
  return found;
}

/**
 * The first file of the tree, in its order, that both patterns match and no
 * protection does. The engine's list is sorted, so the file named is the same
 * on every run.
 */
function heldInBoth(files: readonly string[], x: Glob, y: Glob, avoid: readonly Glob[]): string | undefined {
  const other = matching(files, y);
  for (const file of matching(files, x)) {
    if (other.has(file) && !avoid.some((glob) => matchGlob(glob, file))) return file;
  }
  return undefined;
}

/**
 * Where two writable scopes meet. Each pair of affected patterns is searched
 * for a file both cover that neither brief protects: a file one brief protects
 * is one that brief will not write, so it is no collision.
 *
 * The search names the shortest such path, which the tree need not hold:
 * `src/Shop/OrderService.cs` where the tree has `src/Shop/Orders/OrderService.cs`.
 * So where the search finds a meeting, or cannot decide one, the tree's files
 * are read, and the first both patterns match outside the protections is the
 * witness (ADR-0005, amended 2026-09-30). A file that exists and both briefs
 * may write settles a pair the search could not: it is a collision, proved by
 * the file, not a guess. Where the tree holds none, the search's path stands,
 * as an example. A pair the search proves apart has no such file, and the tree
 * is not read for it.
 */
export function meet(a: Scope, b: Scope, budget: number = WITNESS_BUDGET, files: readonly string[] | null = null): Meeting {
  const avoid = [...a.protected, ...b.protected].map((p) => p.glob);
  const overlaps: Overlap[] = [];
  const undecided: (readonly [string, string])[] = [];
  for (const x of a.affected) {
    for (const y of b.affected) {
      // Two patterns that share no path share none outside the protections.
      // Most pairs of a wave share none, and the search over every protection
      // grew with the protections as well as the pairs: two briefs of 200
      // patterns took 17 seconds, and of 50 names under "**/", over two
      // minutes. Asked first by what each pattern fixes, then of the two
      // alone, a pair proved apart costs that; the search with the
      // protections, whose witness is the one named, runs only for the rest.
      // Without the search of the two alone the answers are those of the
      // search with the protections, which takes longer to give them.
      if (apart(x.glob, y.glob) || globWitness([x.glob, y.glob], [], budget).kind === 'none') continue;
      const witness = globWitness([x.glob, y.glob], avoid, budget);
      if (witness.kind === 'none') continue;
      const patterns: readonly [string, string] = [x.pattern, y.pattern];
      const held = files === null ? undefined : heldInBoth(files, x.glob, y.glob, avoid);
      if (held !== undefined) overlaps.push({ patterns, witness: held, inTree: true });
      else if (witness.kind === 'found') overlaps.push({ patterns, witness: witness.path, inTree: files === null ? null : false });
      else undecided.push(patterns);
    }
  }
  return { overlaps, undecided };
}

/** What every last name a pattern matches starts and ends with: the whole name, for a name written out. */
interface Ends {
  readonly prefix: string;
  readonly suffix: string;
}

/** What a pattern fixes of every path it matches: the directories it lies under, and how its last name starts and ends. */
interface Fixed {
  readonly bases: readonly string[];
  readonly name: Ends | null;
}

const fixedOf = new WeakMap<Glob, Fixed>();

/** A character of a name's syntax, where its written text stops being the name's. */
const NAME_SYNTAX = /[*?[\]{}!]/;

/** The last character of a name's syntax, and the text after it to the end. */
const LAST_SYNTAX = /[*?[\]{}!][^*?[\]{}!]*$/;

/**
 * How the last name of every path a pattern matches starts and ends: the
 * text before the name's first piece of syntax, and after its last; the name
 * itself where it has none. A pattern that ends in `/` or `**` lets the
 * path go on, and its name starts and ends with nothing, which any name does.
 * `null` where the text is not the last name's: a literal that may be read
 * as a directory, a brace whose alternatives end in different directories,
 * an escape. A `*` never matches a `/`, so a name's text is the text of the
 * path's last name.
 */
function lastName(glob: Glob): Ends | null {
  // The source as written, which the parse read trimmed.
  const source = glob.source.trim();
  if (source.includes('\\') || glob.literals.some((literal) => literal.reading !== 'file')) return null;
  let depth = 0;
  let slash = -1;
  for (const [i, ch] of source.split('').entries()) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '/') {
      // A slash inside braces after the last one outside them: the
      // alternatives do not share a last name.
      if (depth > 0) return null;
      slash = i;
    }
  }
  const name = source.slice(slash + 1);
  const first = name.search(NAME_SYNTAX);
  if (first === -1) return { prefix: name, suffix: name };
  return { prefix: name.slice(0, first), suffix: name.slice(name.search(LAST_SYNTAX) + 1) };
}

/** Whether some name can start and end as both say. */
function meetable(a: Ends, b: Ends): boolean {
  const starts = a.prefix.startsWith(b.prefix) || b.prefix.startsWith(a.prefix);
  return starts && (a.suffix.endsWith(b.suffix) || b.suffix.endsWith(a.suffix));
}

/**
 * Found once per pattern, which every pair it is in shares; kept or not, the
 * answer is the same, and only the time differs, so a mutant that does not
 * keep it is equivalent.
 */
function fixed(glob: Glob): Fixed {
  let found = fixedOf.get(glob);
  if (found === undefined) {
    found = { bases: globBases(glob), name: lastName(glob) };
    fixedOf.set(glob, found);
  }
  return found;
}

/** Whether one directory is the other or lies beneath it; the root holds every one. */
function nested(p: string, q: string): boolean {
  return p === '' || q === '' || p === q || q.startsWith(`${p}/`) || p.startsWith(`${q}/`);
}

/**
 * Whether two patterns are proved to share no path by what each fixes: every
 * path of one lies under a directory no path of the other can be under, or
 * no last name can start and end as both require. `false` says nothing; the
 * search decides.
 */
export function apart(x: Glob, y: Glob): boolean {
  const fx = fixed(x);
  const fy = fixed(y);
  if (!fx.bases.some((p) => fy.bases.some((q) => nested(p, q)))) return true;
  return fx.name !== null && fy.name !== null && !meetable(fx.name, fy.name);
}

/**
 * Where one scope writes what another protects: each pair of a pattern the
 * writer may write and a pattern the owner protects that some file lies in,
 * outside the writer's own protections, which it does not write. Run in one
 * wave, the writer changes what the other round was promised would hold. The
 * witness is found as {@link meet} finds one: a file of the tree, or the
 * search's shortest path as an example, and a pair the search cannot decide
 * is said to be undecided.
 *
 * A pair the two patterns alone prove apart is not searched with the
 * writer's protections, which cannot bring the two together.
 */
export function reaches(writer: Scope, owner: Scope, budget: number = WITNESS_BUDGET, files: readonly string[] | null = null): Meeting {
  const avoid = writer.protected.map((p) => p.glob);
  const overlaps: Overlap[] = [];
  const undecided: (readonly [string, string])[] = [];
  for (const x of writer.affected) {
    for (const y of owner.protected) {
      // A pair proved apart, by what each pattern fixes or by the two alone,
      // is apart outside the writer's protections too, as in `meet`. Without
      // the search of the two alone the answers are those of the search with
      // the protections, which takes longer to give them: its mutant is
      // equivalent.
      if (apart(x.glob, y.glob) || globWitness([x.glob, y.glob], [], budget).kind === 'none') continue;
      const witness = globWitness([x.glob, y.glob], avoid, budget);
      if (witness.kind === 'none') continue;
      const patterns: readonly [string, string] = [x.pattern, y.pattern];
      const held = files === null ? undefined : heldInBoth(files, x.glob, y.glob, avoid);
      if (held !== undefined) overlaps.push({ patterns, witness: held, inTree: true });
      else if (witness.kind === 'found') overlaps.push({ patterns, witness: witness.path, inTree: files === null ? null : false });
      else undecided.push(patterns);
    }
  }
  return { overlaps, undecided };
}

/**
 * A witness as a reader is told it: a file of the tree by its path, and a path
 * the search built with a word that it is an example.
 */
export function witnessText(overlap: Overlap): string {
  return overlap.inTree === false ? `${overlap.witness}, an example not in the tree` : overlap.witness;
}

/** A way a brief's scope grew between two readings of it. */
export interface ScopeChange {
  readonly field: 'affectedFiles' | 'protectedFiles';
  /**
   * The pattern `affectedFiles` gained, or `protectedFiles` lost, as written;
   * `**` where `affectedFiles` names no pattern any more and so bounds nothing.
   */
  readonly pattern: string;
  /** The search met its budget before it could say whether the pattern is covered. */
  readonly undecided: boolean;
}

/**
 * How a brief's writable scope grew from `before` to `after`: each pattern
 * of `before`'s protections that `after`'s no longer cover entirely, and each
 * of `after`'s affected patterns that `before`'s did not cover entirely. A
 * pattern rewritten to one that says the same, or reordered, is no change,
 * and narrowing the scope is none either. An affected list that empties is
 * a scope that bounds nothing, where it bounded something; one that was empty
 * bounded nothing already, and cannot grow. A pattern that does not parse
 * scopes nothing, on either side.
 */
export function scopeChanges(before: Scope, after: Scope, budget: number = WITNESS_BUDGET): ScopeChange[] {
  const changes: ScopeChange[] = [];
  const kept = after.protected.map((p) => p.glob);
  for (const { pattern, glob } of before.protected) {
    const answer = globCovers(kept, glob, budget);
    if (answer !== true) changes.push({ field: 'protectedFiles', pattern, undecided: answer === 'undecided' });
  }
  if (before.affected.length === 0) return changes;
  if (after.affected.length === 0) return [...changes, { field: 'affectedFiles', pattern: '**', undecided: false }];
  const bound = before.affected.map((p) => p.glob);
  for (const { pattern, glob } of after.affected) {
    const answer = globCovers(bound, glob, budget);
    if (answer !== true) changes.push({ field: 'affectedFiles', pattern, undecided: answer === 'undecided' });
  }
  return changes;
}

export interface Contradiction {
  /** Affected patterns every file of which is protected: nothing of them is writable. */
  readonly covered: readonly string[];
  /** Affected patterns for which the search could not decide within its budget. */
  readonly undecided: readonly string[];
}

/** The affected patterns a brief's own protections cover entirely. */
export function contradictions(scope: Scope, budget: number = WITNESS_BUDGET): Contradiction {
  const covered: string[] = [];
  const undecided: string[] = [];
  const outer = scope.protected.map((p) => p.glob);
  for (const { pattern, glob } of scope.affected) {
    const answer = globCovers(outer, glob, budget);
    if (answer === true) covered.push(pattern);
    else if (answer === 'undecided') undecided.push(pattern);
  }
  return { covered, undecided };
}
