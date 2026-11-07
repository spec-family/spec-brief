import { describe, expect, it } from 'vitest';

import { planArchive } from '../src/archive.js';
import { type Config, ConfigError, resolveConfig } from '../src/config.js';
import { findBriefs } from '../src/corpus.js';
import { lint } from '../src/lint.js';
import { claimLabel, documentsNamed, readReference, rowStatus, statusWord } from '../src/references.js';
import type { Finding } from '../src/types.js';
import { brief, corpusOf, goodBrief } from './helpers.js';

/**
 * The claims a brief raises and the register rows it awaits, each written
 * `path#name` and read where it is written (ADR-0012).
 */

/**
 * Resolved inside each test that asks: a configuration resolved as the file
 * loads takes the file with it under a mutant that refuses it, and a file
 * that does not load fails no test a sweep counts.
 */
const CONFIG = (): Config =>
  resolveConfig({
    claims: { labels: { Implemented: 'done', Shipped: 'done', Specified: 'open' } },
    registers: { settled: ['Decided', 'done'] },
  });

const SPEC = [
  '# Refunds',
  '',
  '## Limits',
  '',
  '<!-- @spec-item id="refund-limit" -->',
  '- `Specified`: a refund over the capture is refused.',
  '<!-- @spec-item id="refund-window" -->',
  '- `Implemented`: a refund after ninety days is refused.',
  '<!-- @spec-item id="refund-note" -->',
  '- A refund is recorded against its payment.',
  '',
].join('\n');

const REGISTER = [
  '# Decisions',
  '',
  '| ID | Question | Status |',
  '| --- | --- | --- |',
  '| refund-currency | Which currency a refund is paid in | open |',
  '| refund-rounding | How a refund rounds | Decided: half to even |',
  '| refund-fees | Whether fees are refunded | |',
  '',
].join('\n');

const DOCUMENTS: Readonly<Record<string, string | null>> = { 'spec/refunds.md': SPEC, 'docs/decisions.md': REGISTER, 'spec/gone.md': null };

/** The findings of the two rules for one brief with these fields. */
async function findings(front: Record<string, string>, documents = DOCUMENTS, config = CONFIG()): Promise<Finding[]> {
  const corpus = corpusOf({ 'briefs/001_x.md': goodBrief(front) }, config);
  const found = await lint(corpus, { documents: new Map(Object.entries(documents)) });
  return found.filter((finding) => finding.rule === 'raises' || finding.rule === 'awaits');
}

const said = (found: readonly Finding[]): [string, string, string | undefined][] => found.map((f) => [f.severity, f.message, f.subject]);

describe('a reference written in a brief', () => {
  it('is a path from the repository root and the name after its last "#"', () => {
    expect(readReference('spec/refunds.md#refund-limit')).toEqual({ path: 'spec/refunds.md', name: 'refund-limit' });
    expect(readReference(' ./spec//refunds.md # refund-limit ')).toEqual({ path: 'spec/refunds.md', name: 'refund-limit' });
    expect(readReference('/spec/refunds.md#refund-limit')).toEqual({ path: 'spec/refunds.md', name: 'refund-limit' });
    expect(readReference('spec/a#b.md#c')).toEqual({ path: 'spec/a#b.md', name: 'c' });
    expect(readReference('docs/../spec/refunds.md#x')).toEqual({ path: 'spec/refunds.md', name: 'x' });
  });

  it('is none with no "#", nothing before it or nothing after it, and outside where it leaves the repository', () => {
    expect(readReference('spec/refunds.md')).toBeNull();
    expect(readReference('#refund-limit')).toBeNull();
    expect(readReference('./#refund-limit')).toBeNull();
    expect(readReference('spec/refunds.md#')).toBeNull();
    expect(readReference('spec/refunds.md# ')).toBeNull();
    expect(readReference('../other/spec.md#x')).toBe('outside');
  });

  it('names the documents a run reads: of the live briefs, each once, in both fields, and none it cannot place', () => {
    const live = brief(goodBrief({ raises: '[spec/refunds.md#a, ./spec/refunds.md#b, nowhere, ../x.md#c]', awaits: '[docs/decisions.md#d]' }));
    const other = brief(goodBrief({ awaits: '[spec/refunds.md#e, docs/other.md#f]' }), 'briefs/002_y.md');
    const archived = brief(goodBrief({ status: 'archived', raises: '[spec/old.md#g]' }), 'briefs/archive/003_z.md', 'archived');
    expect(documentsNamed([live, other, archived])).toEqual(['spec/refunds.md', 'docs/decisions.md', 'docs/other.md']);
    expect(documentsNamed([])).toEqual([]);
  });
});

describe('what a document says of a name', () => {
  const LABELS = ['Implemented', 'Specified'];

  it('is the label of the claim a @spec-item names, and none for an item that is no claim or a name not there', () => {
    expect(claimLabel(SPEC, 'refund-limit', LABELS)).toBe('Specified');
    expect(claimLabel(SPEC, 'refund-window', LABELS)).toBe('Implemented');
    expect(claimLabel(SPEC, 'refund-note', LABELS)).toBeNull();
    expect(claimLabel(SPEC, 'refund-other', LABELS)).toBeNull();
    // A label the configuration does not name makes no claim.
    expect(claimLabel(SPEC, 'refund-limit', ['Implemented'])).toBeNull();
  });

  it('reads a document that opens with a byte-order mark as one that does not, and the first of two claims of one name', () => {
    expect(claimLabel(`\uFEFF<!-- @spec-item id="a" -->\n- \`Specified\`: one.\n`, 'a', LABELS)).toBe('Specified');
    expect(claimLabel('<!-- @spec-item id="a" -->\n- `Implemented`: one.\n<!-- @spec-item id="a" -->\n- `Specified`: two.\n', 'a', LABELS)).toBe('Implemented');
    expect(rowStatus('\uFEFF| Key | Status |\n| --- | --- |\n| a | open |\n', 'a')).toBe('open');
  });

  it('is the status of the row a register keys, empty where its cell says nothing, and none where no row has the key', () => {
    expect(rowStatus(REGISTER, 'refund-currency')).toBe('open');
    expect(rowStatus(REGISTER, 'refund-rounding')).toBe('Decided: half to even');
    expect(rowStatus(REGISTER, 'refund-fees')).toBe('');
    expect(rowStatus(REGISTER, 'refund-other')).toBeNull();
    expect(rowStatus('| Key | Status |\n| --- | --- |\n| a | open |\n| a | done |\n', 'a')).toBe('open');
  });

  it('reads a status by the word it opens with, in lower case', () => {
    expect(['Decided: half to even', 'done, as two types', ' Done ', 'open(ish)', 'open;', 'proposed\tlater', ''].map(statusWord)).toEqual([
      'decided',
      'done',
      'done',
      'open',
      'open',
      'proposed',
      '',
    ]);
  });
});

describe('the claims a brief raises', () => {
  it('is quiet where each is a claim in a document that exists, whatever its label, and where it names none', async () => {
    expect(await findings({ raises: '[spec/refunds.md#refund-limit, spec/refunds.md#refund-window]' })).toEqual([]);
    expect(await findings({})).toEqual([]);
    expect(await findings({ raises: '[]' })).toEqual([]);
  });

  it('names a claim that is not there, on the field, with the comment that would name it', async () => {
    const found = await findings({ raises: '[spec/refunds.md#refund-note, spec/refunds.md#refund-other]' });
    expect(found.map((f) => [f.line, f.severity, f.message, f.subject])).toEqual([
      [3, 'error', 'raises "spec/refunds.md#refund-note", and spec/refunds.md has no claim named "refund-note"', 'spec/refunds.md#refund-note'],
      [3, 'error', 'raises "spec/refunds.md#refund-other", and spec/refunds.md has no claim named "refund-other"', 'spec/refunds.md#refund-other'],
    ]);
    expect(found[0]?.hint).toBe('write <!-- @spec-item id="refund-note" --> above the claim, a list item that opens with "Implemented" or "Shipped" or "Specified" as code');
  });

  it('names an entry that is not a document and a name, one outside the repository, and one that is not a file', async () => {
    const found = await findings({ raises: '[spec/refunds.md, ../elsewhere.md#x, spec/gone.md#y]' });
    // In the order findings are given: by message, where the line is one.
    expect(said(found)).toEqual([
      ['error', '"../elsewhere.md#x" in raises names a document outside the repository', '../elsewhere.md#x'],
      ['error', '"spec/gone.md#y" in raises names spec/gone.md, which is not a file here', 'spec/gone.md#y'],
      ['error', '"spec/refunds.md" in raises is not a document and a name', 'spec/refunds.md'],
    ]);
    expect(found.map((f) => f.hint)).toEqual([
      'name a document by its path from the repository root',
      'check the path, written from the repository root',
      'write it "path#name", the path from the repository root, such as "spec/refunds.md#refund-limit"',
    ]);
  });

  it('is a field spec-brief knows, as awaits is: a brief with both, each holding, has no finding', async () => {
    const corpus = corpusOf({ 'briefs/001_x.md': goodBrief({ raises: '[spec/refunds.md#refund-limit]', awaits: '[docs/decisions.md#refund-rounding]' }) }, CONFIG());
    expect((await lint(corpus, { documents: new Map(Object.entries(DOCUMENTS)) })).map((f) => [f.rule, f.message])).toEqual([]);
  });

  it('says nothing of a document it was not given', async () => {
    expect(await findings({ raises: '[spec/unread.md#x]' })).toEqual([]);
    expect(await findings({ raises: '[spec/refunds.md#refund-other]' }, {})).toEqual([]);
  });

  it('gives a draft what is not there yet as a warning, and its malformed entries as errors', async () => {
    const found = await findings({ status: 'draft', raises: '[spec/refunds.md#refund-other, spec/gone.md#y, nowhere]' });
    expect(found.map((f) => [f.severity, f.subject])).toEqual([
      ['error', 'nowhere'],
      ['warning', 'spec/gone.md#y'],
      ['warning', 'spec/refunds.md#refund-other'],
    ]);
  });

  it('is one finding, naming the key to set, where no claim labels are configured', async () => {
    const found = await findings({ raises: '[spec/refunds.md#refund-limit, nowhere]' }, DOCUMENTS, resolveConfig({ registers: { settled: ['done'] } }));
    expect(found.map((f) => [f.line, f.severity, f.message, f.subject])).toEqual([[3, 'error', 'raises claims, and no claim labels are configured', undefined]]);
    expect(found[0]?.hint).toBe('set "claims.labels" to the labels claims are written with, each "done" or "open", such as { "Implemented": "done", "Specified": "open" }');
  });

  it('is not asked of an archived brief, whose fields are a record', async () => {
    const corpus = corpusOf({ 'briefs/archive/001_x.md': goodBrief({ status: 'archived', raises: '[spec/refunds.md#refund-other]', awaits: '[docs/decisions.md#refund-currency]' }) }, CONFIG());
    const found = await lint(corpus, { documents: new Map(Object.entries(DOCUMENTS)) });
    expect(found.filter((f) => f.rule === 'raises' || f.rule === 'awaits')).toEqual([]);
  });
});

describe('the register rows a brief awaits', () => {
  it('is quiet where each row is settled, by the word its status opens with, compared without case', async () => {
    expect(await findings({ awaits: '[docs/decisions.md#refund-rounding]' })).toEqual([]);
    expect(await findings({ awaits: '[docs/decisions.md#refund-rounding]' }, { 'docs/decisions.md': REGISTER.replace('Decided: half to even', 'DONE (merged)') })).toEqual([]);
  });

  it('fails an active brief on a row still open, and on one with no status, naming the statuses that settle it', async () => {
    const found = await findings({ awaits: '[docs/decisions.md#refund-currency, docs/decisions.md#refund-fees]' });
    expect(found.map((f) => [f.line, f.severity, f.message, f.subject])).toEqual([
      [3, 'error', 'awaits "docs/decisions.md#refund-currency", which is "open"', 'docs/decisions.md#refund-currency'],
      [3, 'error', 'awaits "docs/decisions.md#refund-fees", which has no status', 'docs/decisions.md#refund-fees'],
    ]);
    expect(found[0]?.hint).toBe('the round starts once the row is "Decided" or "done": settle it first, or keep this brief a draft until it is');
  });

  it('warns a round that has not started of a row still open: a draft, and deferred work', async () => {
    expect(said(await findings({ status: 'draft', awaits: '[docs/decisions.md#refund-currency]' }))).toEqual([
      ['warning', 'awaits "docs/decisions.md#refund-currency", which is "open"', 'docs/decisions.md#refund-currency'],
    ]);
    expect(said(await findings({ status: 'deferred', trigger: 'when the second tenant signs', awaits: '[docs/decisions.md#refund-currency]' }))).toEqual([
      ['warning', 'awaits "docs/decisions.md#refund-currency", which is "open"', 'docs/decisions.md#refund-currency'],
    ]);
  });

  it('names a row no register keys, a warning in a draft, and the entries it cannot read as the claims do', async () => {
    const found = await findings({ awaits: '[docs/decisions.md#refund-other, docs/decisions.md, spec/gone.md#z]' });
    expect(said(found)).toEqual([
      ['error', '"docs/decisions.md" in awaits is not a document and a name', 'docs/decisions.md'],
      ['error', '"spec/gone.md#z" in awaits names spec/gone.md, which is not a file here', 'spec/gone.md#z'],
      ['error', 'awaits "docs/decisions.md#refund-other", and docs/decisions.md has no register row keyed "refund-other"', 'docs/decisions.md#refund-other'],
    ]);
    expect(found[2]?.hint).toBe('a register is a table with a key column, such as "ID" or "Key", and a status column after it');
    expect((await findings({ status: 'draft', awaits: '[docs/decisions.md#refund-other]' })).map((f) => f.severity)).toEqual(['warning']);
    expect((await findings({ status: 'deferred', trigger: 'when the second tenant signs', awaits: '[docs/decisions.md#refund-other]' })).map((f) => f.severity)).toEqual(['error']);
  });

  it('is one finding, naming the key to set, where no settled statuses are configured', async () => {
    const found = await findings({ awaits: '[docs/decisions.md#refund-rounding, nowhere]' }, DOCUMENTS, resolveConfig({ claims: { labels: { Implemented: 'done' } } }));
    expect(found.map((f) => [f.line, f.severity, f.message, f.subject])).toEqual([[3, 'error', 'awaits register rows, and no settled statuses are configured', undefined]]);
    expect(found[0]?.hint).toBe('set "registers.settled" to the statuses that settle a row, such as ["decided", "done"]');
  });
});

describe('the configuration of what the words mean', () => {
  const refusal = (raw: unknown): readonly string[] => {
    try {
      resolveConfig(raw);
    } catch (error) {
      return (error as ConfigError).problems;
    }
    return [];
  };

  it('takes each label as "done" or "open", and merges each key over its default', () => {
    expect(resolveConfig({ claims: { labels: { Implemented: 'done' } } }).claims).toEqual({ labels: { Implemented: 'done' } });
    expect(resolveConfig({ claims: {} }).claims).toEqual({ labels: {} });
    expect(resolveConfig({ registers: { settled: ['decided'] } }).registers).toEqual({ settled: ['decided'] });
    expect(resolveConfig({ registers: {} }).registers).toEqual({ settled: [] });
    expect(refusal({ claims: { labels: { Implemented: 'finished' } } })).toEqual(['"claims.labels.Implemented" must be one of "done", "open", not "finished"']);
  });

  it('refuses a settled status that is not one word, which would settle no row', () => {
    expect(refusal({ registers: { settled: ['done', 'decided: yes', 'not started', 'open(ish)', ' done '] } })).toEqual([
      '"registers.settled" holds "decided: yes", which is not one word: a row\'s status is read by the word it opens with',
      '"registers.settled" holds "not started", which is not one word: a row\'s status is read by the word it opens with',
      '"registers.settled" holds "open(ish)", which is not one word: a row\'s status is read by the word it opens with',
      '"registers.settled" holds " done ", which is not one word: a row\'s status is read by the word it opens with',
    ]);
    expect(refusal({ registers: { settled: ['Decided', 'DONE'] } })).toEqual([]);
  });
});

describe('archiving a round that raises claims', () => {
  /** `null` for a plan given no documents: a parameter given `undefined` takes its default. */
  const plan = (front: Record<string, string>, documents: Readonly<Record<string, string | null>> | null = DOCUMENTS, config = CONFIG()) => {
    const corpus = corpusOf({ 'briefs/001_x.md': goodBrief(front) }, config);
    return planArchive(corpus, findBriefs(corpus, '001')[0]!, { date: '2026-11-08', ...(documents === null ? {} : { documents: new Map(Object.entries(documents)) }) });
  };
  const refused = (front: Record<string, string>, documents: Readonly<Record<string, string | null>> | null = DOCUMENTS, config = CONFIG()) =>
    plan(front, documents, config).blocking.filter((f) => f.rule === 'claim-not-raised');

  it('refuses it while a claim it raises carries a label that says the work is open', () => {
    const found = refused({ raises: '[spec/refunds.md#refund-limit, spec/refunds.md#refund-window]' }, DOCUMENTS);
    expect(found).toEqual([
      {
        rule: 'claim-not-raised',
        severity: 'error',
        message: 'raises "spec/refunds.md#refund-limit", which is still "Specified"',
        file: 'briefs/001_x.md',
        line: 3,
        brief: '001',
        hint: 'raise it to "Implemented" or "Shipped" once its evidence is in, or drop it from raises if this round does not raise it',
      },
    ]);
  });

  it('archives it once each claim is done', () => {
    const raised = { 'spec/refunds.md': SPEC.replace('`Specified`: a refund over', '`Shipped`: a refund over') };
    expect(refused({ raises: '[spec/refunds.md#refund-limit, spec/refunds.md#refund-window]' }, raised)).toEqual([]);
    expect(plan({ raises: '[spec/refunds.md#refund-limit]' }, raised).blocking).toEqual([]);
  });

  it('leaves to the raises rule a claim that is not there, and checks none it was not given', () => {
    expect(refused({ raises: '[spec/refunds.md#refund-note, spec/refunds.md#refund-other, spec/gone.md#x, nowhere, ../out.md#y]' }, DOCUMENTS)).toEqual([]);
    expect(refused({ raises: '[spec/refunds.md#refund-limit]' }, null)).toEqual([]);
    expect(refused({ raises: '[spec/refunds.md#refund-limit]' }, {})).toEqual([]);
  });

  it('says what to configure where no label says the work is done', () => {
    const config = resolveConfig({ claims: { labels: { Specified: 'open' } } });
    expect(refused({ raises: '[spec/refunds.md#refund-limit]' }, DOCUMENTS, config).map((f) => f.hint)).toEqual([
      'no label in "claims.labels" says "done": add the one a finished claim is written with',
    ]);
  });
});
