import { statSync } from 'node:fs';

import { defineConfig } from 'vitest/config';
import type { Reporter, TestModule, TestSequencer, TestSpecification, Vitest } from 'vitest/node';

/**
 * Whether each test file failed when this process last ran it, as vitest 4's
 * cache had it and vitest 5's does not.
 *
 * Stryker narrows each mutant's run to the tests that cover it, by a test name
 * pattern, and stops a run at its first failure. Vitest 5 counts either run as
 * partial, and from a partial run its cache takes a failure and keeps it until
 * a run of the whole file passes; it also reads back what the other workers
 * write to the same cache file. So in a sweep a file that killed one mutant,
 * in any worker, stayed failed for every mutant after it, and the order lost
 * the file that killed the last mutant (spec-core's ADR-0008, amended
 * 2026-11-09). So the order keeps its own record, by vitest 4's rule: a file
 * that passed or failed in a run has that verdict until a run runs it again,
 * and a file the run skipped or did not reach keeps the one it had. Vitest
 * calls the sequencer and the reporters in the one process that drives the
 * worker, so the record lives in that process's memory, with no file to name
 * or clean up, and dies with it.
 *
 * The times stay the cache's, on vitest 5 the dry run's, of each whole file,
 * where vitest 4 took each run's, narrowed or stopped. A record of each run's
 * time as well, swept in spec-core, read no better (its ADR-0007, 2026-11-09).
 */
const failedLast = new Map<string, boolean>();

/** The reporter that keeps the record above, named in both sweeps' suites. */
export const lastRun = {
  // No `onInit`: vitest 5 calls it at the start of every run, which would
  // empty the record before each sort (spec-core's ADR-0007, 2026-11-09).
  onTestModuleEnd(module: TestModule): void {
    const state = module.state();
    if (state === 'passed' || state === 'failed') failedLast.set(module.moduleId, state === 'failed');
  },
} satisfies Reporter;

/**
 * The order a mutant's test files run in, in both sweeps: a file that failed
 * when this process last ran it first, as vitest 4 had it, then the quickest
 * first, where vitest runs the longest first.
 *
 * Stryker runs a mutant's files one after another in one worker and stops at
 * the first test that fails, so what a mutant costs is the files that run
 * before the one that kills it. Vitest's order suits a run that reports every
 * failure and wants the long files started early; here it put
 * `tests/glob.test.ts`, `tests/cli.test.ts` and `tests/schedule.test.ts`, three
 * fifths of the suite's time between them, ahead of the unit file that kills
 * the mutant in milliseconds. In the last full sweep before this order, 99 of
 * the 726 static mutants and 600 of the others were killed only after another
 * file's tests had run, 47,370 tests between them (ADR-0009, amended
 * 2026-10-11).
 *
 * No test leaves the run and none is added: a mutant survives when every
 * file has passed, in any order.
 *
 * A file the worker has not run yet has no time to go by. It runs after
 * those that have, the smaller first, and has a time from then on. Each
 * suite is one project, so vitest's rules for several are not repeated.
 * Vitest 5 asks its cache by a file's specification and keeps no sizes,
 * reading one from the disk where a file has no time; so does this.
 *
 * The type alone is imported from `vitest/node`: four test files read
 * `vitest.core.config.ts`, which reads this file, and a class that extended
 * vitest's own would have each of them load vitest's node side.
 */
export class QuickestFirst implements TestSequencer {
  readonly #ctx: Vitest;

  constructor(ctx: Vitest) {
    this.#ctx = ctx;
  }

  /** Neither sweep hands vitest a shard; a run that did gets vitest's own split. */
  async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { BaseSequencer } = await import('vitest/node');
    return new BaseSequencer(this.#ctx).shard(files);
  }

  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { cache } = this.#ctx;
    const rank = (file: TestSpecification): [number, number] => {
      // What vitest's own sequencer asks its cache; a test holds the two
      // together. Its `failed` is not read: that is the record's.
      const last = cache.getTestSpecificationResult(file);
      if (last === undefined) return [2, statSync(file.moduleId, { throwIfNoEntry: false })?.size ?? 0];
      return [failedLast.get(file.moduleId) === true ? 0 : 1, last.duration];
    };
    const ranked = files.map((file) => ({ file, rank: rank(file) }));
    return ranked.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]).map(({ file }) => file);
  }
}

/**
 * Vitest configuration for mutation runs: the same suite, without coverage
 * instrumentation. Stryker measures its own coverage per test, and v8
 * coverage on every one of thousands of mutant runs is a number nobody reads.
 *
 * The CLI tests drive `main()` in process rather than spawning the binary, so
 * they load the mutated source and can kill mutants. Six files are left out.
 * `bin.test.ts` spawns the built binary, which a mutant never reaches.
 * `source.test.ts` reads the source as text, and in the sandbox that text is
 * Stryker's instrumented copy, which says `process` in every file.
 * `mutation-order.test.ts` tests the order above and reaches nothing under
 * `src/`, so no mutant can fail it, and every static mutant would run it.
 * `mutation-unmeasured.test.ts` counts what stands under an `as` in the
 * sources as text, which is that copy again, and no mutant's to fail.
 * `mutation-sweeps.test.ts` asks Stryker which sources it makes a mutant of,
 * of that copy too, and `mutation-compare.test.ts` tests a script under
 * `scripts/`, where no mutant is.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/bin.test.ts',
      'tests/source.test.ts',
      'tests/mutation-compare.test.ts',
      'tests/mutation-order.test.ts',
      'tests/mutation-sweeps.test.ts',
      'tests/mutation-unmeasured.test.ts',
      '**/node_modules/**',
    ],
    environment: 'node',
    // The git tests spawn git a dozen times. That is milliseconds on a Linux
    // runner and, measured on a Windows workstation with real-time scanning,
    // over a second a process.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    sequence: { sequencer: QuickestFirst },
    // Named, so that vitest adds none of its own. A suite that names none
    // gets vitest's github-actions reporter beside the default one on a
    // runner, and it appends a summary of each run to the step's: one a
    // mutant, about 200 bytes each, which came to 1,049k in the core sweep
    // and 1,403k in this one on main's push of cab7f8b. GitHub uploads 1MiB
    // of a step's summary, and both jobs ended on an error annotation that
    // the upload was aborted. The default reporter writes to the worker's
    // output, as it did, which Stryker shows only for a worker that exits
    // unexpectedly. The other keeps the order's record and writes nothing.
    reporters: ['default', lastRun],
  },
});
