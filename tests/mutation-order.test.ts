import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseSequencer, type TestModule, type TestModuleState, type TestSpecification, type Vitest } from 'vitest/node';

import strykerCore from '../stryker.core.config.mjs';
import stryker from '../stryker.config.mjs';
import vitestConfig from '../vitest.config.js';
import vitestCore from '../vitest.core.config.js';
import vitestMutation, { lastRun, QuickestFirst } from '../vitest.mutation.config.js';

/**
 * The order a mutant's test files run in, in both sweeps (ADR-0009, amended
 * 2026-10-11): a file that failed last first, then the quickest.
 *
 * The order is the sweeps' and no mutant is under it. This file reaches
 * nothing under src/, so it cannot kill one, and it loads vitest's node side
 * to set the order beside vitest's own: it is left out of both sweeps'
 * suites, where every static mutant would run it. What the sweeps report is
 * held here too, as vitest resolves it from the same two files.
 */

const REPOSITORY = join(import.meta.dirname, '..');

/** What a worker's cache holds for a file after its last run. */
type Timed = Record<string, { duration: number; failed: boolean }>;

// The files as the full sweep times them, the three longest and three of the
// quickest, and three the worker has not run yet, with sizes on disk: one of
// those is fewer bytes than the long files are milliseconds, and still runs
// after them, since a size is no time.
const TIMED: Timed = {
  'tests/glob.test.ts': { duration: 2480, failed: false },
  'tests/cli.test.ts': { duration: 1380, failed: false },
  'tests/schedule.test.ts': { duration: 1170, failed: false },
  'tests/config.test.ts': { duration: 22, failed: false },
  'tests/trigger.test.ts': { duration: 9, failed: false },
  'tests/text.test.ts': { duration: 8, failed: false },
};
const SIZES: Record<string, number> = {
  'tests/glob.test.ts': 31_000,
  'tests/cli.test.ts': 78_000,
  'tests/schedule.test.ts': 41_000,
  'tests/config.test.ts': 12_000,
  'tests/trigger.test.ts': 6_000,
  'tests/text.test.ts': 5_000,
  'tests/rules.test.ts': 64_000,
  'tests/links.test.ts': 900,
  'tests/engine.test.ts': 52_000,
};
const FOUND = Object.keys(SIZES);

describe("the order a mutant's test files run in", () => {
  // Files of those sizes, where both sequencers look for them: vitest 5 keeps
  // no sizes in its cache and reads one from the disk where a file has no
  // time. In a folder named for this process, as Stryker runs a file in
  // several workers at once (tests/helpers.ts), and of each test's own: the
  // order's record is the module's, and a file it has not seen is one no
  // worker has run.
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), `spec-brief-sequencer-${process.pid}-`)).split(sep).join('/');
    for (const [file, size] of Object.entries(SIZES)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), 'x'.repeat(size));
    }
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // The order's own record, told of a file's end as vitest tells a reporter.
  const ended = (file: string, state: TestModuleState): void => {
    lastRun.onTestModuleEnd({ moduleId: `${root}/${file}`, state: () => state } as unknown as TestModule);
  };
  // A run of every file the worker has timed, in which those named failed and
  // the rest passed.
  const ran = (failed: readonly string[]): void => {
    for (const file of Object.keys(TIMED)) ended(file, failed.includes(file) ? 'failed' : 'passed');
  };

  const worker = (timed: Timed, found: readonly string[] = FOUND) => {
    const asked: string[] = [];
    const ctx = {
      config: { root, shard: { index: 1, count: 3 } },
      cache: {
        // The one question vitest 5's sequencer asks its cache; the questions
        // by key that vitest 4's asked are not answered here.
        getTestSpecificationResult: (file: TestSpecification) => {
          const key = file.moduleId.slice(root.length + 1);
          asked.push(key);
          return timed[key];
        },
      },
    } as unknown as Vitest;
    const files = found.map(
      (file) => ({ moduleId: `${root}/${file}`, project: { name: '', config: { isolate: true, sequence: { groupOrder: 0 } } } }) as unknown as TestSpecification,
    );
    return { ctx, files, asked };
  };

  const names = (files: readonly TestSpecification[]): string[] => files.map((file) => file.moduleId.slice(`${root}/tests/`.length).replace('.test.ts', ''));

  it('runs the quickest file first, and a file the worker has not timed after those it has, the smaller first', async () => {
    const { ctx, files } = worker(TIMED);
    const order = names(await new QuickestFirst(ctx).sort(files));
    expect(order).toEqual(['text', 'trigger', 'config', 'schedule', 'cli', 'glob', 'links', 'engine', 'rules']);
    // Whatever order vitest found them in.
    expect(names(await new QuickestFirst(ctx).sort([...files].reverse()))).toEqual(order);
    // The list it was handed is left as it was.
    expect(names(files)).toEqual(FOUND.map((file) => file.slice('tests/'.length).replace('.test.ts', '')));
  });

  it('runs a file that failed in the last run before any that passed, however long it takes', async () => {
    // What keeps the next mutant of the same source cheap: the file that killed the last one goes first.
    ran(['tests/glob.test.ts', 'tests/config.test.ts']);
    const { ctx, files } = worker(TIMED);
    expect(names(await new QuickestFirst(ctx).sort(files))).toEqual(['config', 'glob', 'text', 'trigger', 'schedule', 'cli', 'links', 'engine', 'rules']);
    // A run of one file, which passes; the other has not run since it failed.
    ended('tests/config.test.ts', 'passed');
    expect(names(await new QuickestFirst(ctx).sort(files))).toEqual(['glob', 'text', 'trigger', 'config', 'schedule', 'cli', 'links', 'engine', 'rules']);
  });

  it("takes no failure from vitest's cache, which keeps one from a narrowed run until a run of the whole file passes", async () => {
    // Every file passed when the worker last ran it, and the cache still has
    // the longest failed.
    ran([]);
    const kept = { ...TIMED, 'tests/glob.test.ts': { duration: 2480, failed: true } };
    const { ctx, files } = worker(kept);
    expect(names(await new QuickestFirst(ctx).sort(files))).toEqual(['text', 'trigger', 'config', 'schedule', 'cli', 'glob', 'links', 'engine', 'rules']);
  });

  it("keeps a file's verdict through a run that skips it or does not reach it, until a run runs it", async () => {
    ran(['tests/config.test.ts']);
    for (const state of ['skipped', 'pending', 'queued'] as const) ended('tests/config.test.ts', state);
    ended('tests/text.test.ts', 'passed');
    const { ctx, files } = worker(TIMED);
    expect(names(await new QuickestFirst(ctx).sort(files))).toEqual(['config', 'text', 'trigger', 'schedule', 'cli', 'glob', 'links', 'engine', 'rules']);
    ended('tests/config.test.ts', 'passed');
    expect(names(await new QuickestFirst(ctx).sort(files))).toEqual(['text', 'trigger', 'config', 'schedule', 'cli', 'glob', 'links', 'engine', 'rules']);
  });

  it('differs from the order vitest would give in that alone, and asks the cache what vitest asks it', async () => {
    const failed = { ...TIMED, 'tests/config.test.ts': { duration: 22, failed: true } };
    const timed = Object.keys(TIMED);
    ran(['tests/config.test.ts']);

    // Vitest's own: the failed file, then the longest, which is why a mutant
    // that only a unit test kills waited for the glob, CLI and schedule tests.
    const theirs = worker(failed, timed);
    expect(names(await new BaseSequencer(theirs.ctx).sort(theirs.files))).toEqual(['config', 'glob', 'cli', 'schedule', 'trigger', 'text']);
    const ours = worker(failed, timed);
    expect(names(await new QuickestFirst(ours.ctx).sort(ours.files))).toEqual(['config', 'text', 'trigger', 'schedule', 'cli', 'glob']);

    // A question vitest's cache stopped answering would find nothing, every
    // file would count as never run, and the order would quietly be by size.
    // The cache files a result by the file's project and path, which it reads
    // off the specification itself, so the order hands it that as vitest does.
    expect(new Set(ours.asked)).toEqual(new Set(theirs.asked));
    expect(new Set(ours.asked)).toEqual(new Set(Object.keys(TIMED)));
  });

  it('gives a shard of the suite the files vitest gives it', async () => {
    // Neither sweep hands vitest a shard; one that did would split as vitest does.
    const { ctx, files } = worker(TIMED);
    const theirs = names(await new BaseSequencer(ctx).shard(files));
    expect(theirs).toHaveLength(3);
    expect(names(await new QuickestFirst(ctx).shard(files))).toEqual(theirs);
  });

  /**
   * Stryker's vitest runner as it runs one mutant after another, in a process
   * of its own: a vitest made from a sweep's configuration with the options
   * the runner gives it, and runs of both files narrowed by a test name
   * pattern, each after clearing the files of the run before. Of each run,
   * the order vitest ran the two files in, as the sequencer it resolved gave
   * that order inside the run, and whether vitest's cache had `long` failed
   * after it: `short`, whose test takes 50 ms, and `long`, whose tests take
   * 200, none and none, the second failing.
   */
  type Run = { order: string[]; failed: boolean };
  function asStrykerRuns(config: string, patterns: readonly string[]): Run[] {
    const work = mkdtempSync(join(tmpdir(), `spec-brief-runs-${process.pid}-`));
    try {
      mkdirSync(join(work, 'tests'));
      const pause = (ms: number) => `await new Promise((end) => setTimeout(end, ${ms}));`;
      writeFileSync(join(work, 'tests/short.test.ts'), `test('short holds', async () => { ${pause(50)} });`);
      writeFileSync(join(work, 'tests/long.test.ts'), `test('long holds', async () => { ${pause(200)} }); test('long breaks', () => { throw new Error('broken'); }); test('long quick', () => {});`);
      const script = `
        import { createVitest } from 'vitest/node';
        const ctx = await createVitest('test', {
          root: ${JSON.stringify(work)},
          config: ${JSON.stringify(join(REPOSITORY, config))},
          globals: true, watch: false, pool: 'forks', maxWorkers: 1, maxConcurrency: 1, bail: 1, coverage: { enabled: false },
        });
        const name = (file) => file.moduleId.slice(file.moduleId.lastIndexOf('/') + 1, -'.test.ts'.length);
        const orders = [];
        const { sort } = ctx.config.sequence.sequencer.prototype;
        ctx.config.sequence.sequencer.prototype.sort = async function (files) {
          const sorted = await sort.call(this, files);
          orders.push(sorted.map(name));
          return sorted;
        };
        const files = ['short', 'long'].map((file) => ctx.config.root + '/tests/' + file + '.test.ts');
        const long = ctx.getRootProject().createSpecification(files[1]);
        const results = [];
        for (const pattern of ${JSON.stringify(patterns)}) {
          ctx.state.filesMap.clear();
          for (const project of ctx.projects) project.config.testNamePattern = new RegExp(pattern);
          await ctx.start(files);
          results.push({ order: orders.at(-1), failed: ctx.cache.getTestSpecificationResult(long).failed });
        }
        await ctx.close();
        process.exitCode = 0;
        process.stdout.write('@runs@' + JSON.stringify(results));
      `;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: REPOSITORY, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return JSON.parse(out.slice(out.lastIndexOf('@runs@') + '@runs@'.length)) as Run[];
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  it.each(['vitest.mutation.config.ts', 'vitest.core.config.ts'])(
    "runs first, inside the next run, the file that failed in the run before, then the quicker, in runs narrowed as Stryker narrows them, where vitest 5's cache keeps an older failure (%s)",
    (config) => {
      const runs = asStrykerRuns(config, ['holds$', 'short holds$|long breaks$', 'holds$', 'short holds$|long quick$', 'holds$']);
      // The smaller first, as neither has a time; then the quicker; then the
      // one that failed in the run before; then, as it passed there, the
      // quicker again; and after a run of its one quick test, still `short`,
      // by the cache's time, the whole file's: a record of each run's time,
      // which would run `long` first there, swept no better in spec-core (its
      // ADR-0007, 2026-11-09). A record emptied at the start of each run, as
      // an `onInit` of the reporter would empty it, runs the quicker first in
      // the third.
      expect(runs.map(({ order }) => order)).toEqual([
        ['short', 'long'],
        ['short', 'long'],
        ['long', 'short'],
        ['short', 'long'],
        ['short', 'long'],
      ]);
      // Why the order keeps a record: from the second run on vitest's cache
      // has `long` failed, and by it the fourth run would run `long` first.
      // Where it does not, vitest forgets a failure as 4 did, and spec-core's
      // ADR-0008 says what a sweep must show before the record goes.
      expect(runs.map(({ failed }) => failed)).toEqual([false, true, true, true, true]);
    },
  );
});

describe('the suites that run in this order', () => {
  it('are the two sweeps, each of which runs every file of its suite for a static mutant', () => {
    // `related: false`: Stryker hands vitest the files itself, and with
    // perTest coverage a mutant no test covers alone runs them all.
    expect(stryker.vitest).toEqual({ configFile: 'vitest.mutation.config.ts', related: false });
    expect(strykerCore.vitest).toEqual({ configFile: 'vitest.core.config.ts', related: false });
    expect(vitestMutation.test?.sequence).toEqual({ sequencer: QuickestFirst });
    expect(vitestCore.test?.sequence).toEqual({ sequencer: QuickestFirst });
  });

  it('and not the suite `npm test` runs, which reports every failure and runs its files side by side', () => {
    expect(vitestConfig.test?.sequence).toBeUndefined();
  });

  it("name the reporter that keeps the order's record beside vitest's default, which the suite `npm test` runs does not", () => {
    // The next describe holds both to what vitest makes of them on a runner.
    expect(vitestMutation.test?.reporters).toEqual(['default', lastRun]);
    expect(vitestCore.test?.reporters).toEqual(['default', lastRun]);
    expect(vitestConfig.test?.reporters).toBeUndefined();
  });

  it('leave this file out, which no mutant can fail', () => {
    expect(vitestCore.test?.exclude).toContain('tests/mutation-order.test.ts');
    expect(vitestMutation.test?.exclude).toContain('tests/mutation-order.test.ts');
  });

  it('allow a mutant the same time, so that neither calls timed out what the other lets run to its end', () => {
    // A timeout is scored as a detection. With three seconds of its own the
    // core sweep scored so mutants that survive the full sweep, and static
    // mutants a test kills once a file the worker had not timed gets its turn
    // (ADR-0009, amended 2026-10-11).
    expect(strykerCore.timeoutMS).toBe(stryker.timeoutMS);
    // Longer only costs minutes; shorter is a measurement first.
    expect(stryker.timeoutMS).toBeGreaterThanOrEqual(20_000);
  });
});

describe('what the sweeps report', () => {
  /**
   * The reporters vitest gives a run of a suite on a GitHub runner, where
   * every step has GITHUB_ACTIONS set to true, resolved by vitest itself from
   * the configuration file, as Stryker's runner has it resolve them: it names
   * none of its own. Vitest 5 reads the variable once, when it is first
   * imported, so the suite is resolved in a process started with it.
   */
  function onARunner(file: string): string[] {
    const resolve = [
      "import { resolveConfig } from 'vitest/node';",
      `const { test } = await resolveConfig({ root: ${JSON.stringify(REPOSITORY)}, config: ${JSON.stringify(join(REPOSITORY, file))} });`,
      "const names = test.reporters.map((reporter) => (Array.isArray(reporter) ? String(reporter[0]) : 'inline'));",
      // After anything vitest prints on the way.
      "process.stdout.write('@reporters@' + JSON.stringify(names));",
    ].join('\n');
    const env = { ...process.env, GITHUB_ACTIONS: 'true' };
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', resolve], { cwd: REPOSITORY, env, encoding: 'utf8' });
    return JSON.parse(out.slice(out.lastIndexOf('@reporters@') + '@reporters@'.length)) as string[];
  }

  it("is vitest's default reporter and the order's record alone, in both sweeps, so that no mutant's run adds a summary to the step's", () => {
    // Where a suite names none, vitest adds its github-actions reporter on a
    // runner, and it appends a summary of every run to the step's own: the
    // core sweep's came to 1,049k and the full sweep's to 1,403k on main's
    // push of cab7f8b, where GitHub uploads 1MiB a step, and each job ended
    // on an error annotation that said so (vitest.mutation.config.ts). The
    // record is the reporter given inline, as the test above has it.
    expect(onARunner('vitest.mutation.config.ts')).toEqual(['default', 'inline']);
    expect(onARunner('vitest.core.config.ts')).toEqual(['default', 'inline']);
  });

  it('and not the suite `npm test` runs, whose run on a runner keeps the annotations and the summary vitest gives it', () => {
    expect(onARunner('vitest.config.ts')).toContain('github-actions');
  });
});
