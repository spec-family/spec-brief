import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { BaseSequencer, type TestSpecification, type Vitest } from 'vitest/node';

import strykerCore from '../stryker.core.config.mjs';
import stryker from '../stryker.config.mjs';
import vitestConfig from '../vitest.config.js';
import vitestCore from '../vitest.core.config.js';
import vitestMutation, { QuickestFirst } from '../vitest.mutation.config.js';

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
  // several workers at once (tests/helpers.ts).
  const root = mkdtempSync(join(tmpdir(), `spec-brief-sequencer-${process.pid}-`)).split(sep).join('/');
  for (const [file, size] of Object.entries(SIZES)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), 'x'.repeat(size));
  }
  afterAll(() => rmSync(root, { recursive: true, force: true }));

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
    const failed = { ...TIMED, 'tests/glob.test.ts': { duration: 2480, failed: true }, 'tests/config.test.ts': { duration: 22, failed: true } };
    const { ctx, files } = worker(failed);
    expect(names(await new QuickestFirst(ctx).sort(files))).toEqual(['config', 'glob', 'text', 'trigger', 'schedule', 'cli', 'links', 'engine', 'rules']);
  });

  it('differs from the order vitest would give in that alone, and asks the cache what vitest asks it', async () => {
    const failed = { ...TIMED, 'tests/config.test.ts': { duration: 22, failed: true } };
    const timed = Object.keys(TIMED);

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

  it("is vitest's default reporter alone, in both sweeps, so that no mutant's run adds a summary to the step's", () => {
    // Where a suite names none, vitest adds its github-actions reporter on a
    // runner, and it appends a summary of every run to the step's own: the
    // core sweep's came to 1,049k and the full sweep's to 1,403k on main's
    // push of cab7f8b, where GitHub uploads 1MiB a step, and each job ended
    // on an error annotation that said so (vitest.mutation.config.ts).
    expect(onARunner('vitest.mutation.config.ts')).toEqual(['default']);
    expect(onARunner('vitest.core.config.ts')).toEqual(['default']);
  });

  it('and not the suite `npm test` runs, whose run on a runner keeps the annotations and the summary vitest gives it', () => {
    expect(onARunner('vitest.config.ts')).toContain('github-actions');
  });
});
