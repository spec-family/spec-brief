/**
 * The claims a round raises and the register rows it waits on, named by a
 * brief as `path#name` and read where they are written (ADR-0012).
 *
 * Pure: the engine reads each document a brief names, and this reads what it
 * read. Which item is a claim, which name a `@spec-item` gives it, and which
 * row of a register holds a key are spec-core's readings, the ones spec-guard
 * and spec-graph read the same documents by.
 */

import type { Brief } from './brief.js';
import { normalisePath } from './links.js';
import { literal } from './literal.js';
import { stripBom } from './text.js';
import { findClaims, findItemIds, findRegisterRows, scanMarkdown } from './vendor/spec-core/markdown/index.js';

/** The fields that name a document and a name in it. */
export const REFERENCE_FIELDS = literal(['raises', 'awaits']) satisfies readonly (keyof Brief)[];

export type ReferenceField = (typeof REFERENCE_FIELDS)[number];

/** A document and a name in it, as a brief writes one: `spec/refunds.md#refund-limit`. */
export interface Reference {
  /** Repository-relative and normalised, as a scope pattern is. */
  readonly path: string;
  readonly name: string;
}

/**
 * Reads `path#name`: `null` for one that is not that, with no `#`, nothing
 * before it or nothing after it, and `'outside'` for a path that leaves the
 * repository. The name is everything after the last `#`, which no path
 * written in a brief ends with.
 */
export function readReference(written: string): Reference | 'outside' | null {
  const at = written.lastIndexOf('#');
  if (at === -1) return null;
  const name = written.slice(at + 1).trim();
  let path: string;
  try {
    path = normalisePath(written.slice(0, at).trim());
  } catch {
    return 'outside';
  }
  return path === '' || name === '' ? null : { path, name };
}

/**
 * What an entry names, against the documents a run read: `unwritten` where
 * it is not `path#name`, `outside` where it leaves the repository,
 * `unread` where its document was not read, `missing` where that is no
 * file, and `read` with the document's text.
 */
export type Named =
  | { readonly kind: 'unwritten' }
  | { readonly kind: 'outside' }
  | { readonly kind: 'unread' }
  | { readonly kind: 'missing'; readonly reference: Reference }
  | { readonly kind: 'read'; readonly reference: Reference; readonly text: string };

export function lookUp(written: string, documents: ReadonlyMap<string, string | null>): Named {
  const reference = readReference(written);
  if (reference === null) return { kind: 'unwritten' };
  if (reference === 'outside') return { kind: 'outside' };
  const text = documents.get(reference.path);
  if (text === undefined) return { kind: 'unread' };
  return text === null ? { kind: 'missing', reference } : { kind: 'read', reference, text };
}

/** Every document the live briefs name, each once, in the order first named. */
export function documentsNamed(briefs: readonly Brief[]): string[] {
  const paths = new Set<string>();
  for (const brief of briefs) {
    if (brief.phase !== 'live') continue;
    for (const field of REFERENCE_FIELDS) {
      for (const written of brief[field]) {
        const reference = readReference(written);
        if (reference !== null && reference !== 'outside') paths.add(reference.path);
      }
    }
  }
  return [...paths];
}

/**
 * The label of the claim a document names `name`, by `<!-- @spec-item
 * id="name" -->`, among the labels given; `null` where no such claim is
 * there. Of two claims given one name, the first.
 */
export function claimLabel(text: string, name: string, labels: readonly string[]): string | null {
  const scan = scanMarkdown(stripBom(text));
  const ids = findItemIds(scan);
  return findClaims(scan, labels).find((claim) => ids.get(claim.item) === name)?.label ?? null;
}

/**
 * The status of the row a register keys `name`, read flat; `null` where no
 * row has that key, and `''` where the row says no status. Of two rows with
 * one key, the first.
 */
export function rowStatus(text: string, name: string): string | null {
  const row = findRegisterRows(scanMarkdown(stripBom(text))).find((candidate) => candidate.key === name);
  return row === undefined ? null : (row.status ?? '');
}

/**
 * The word a status opens with, in lower case: `done` of `done: the rules
 * (commit "...")`, of `done, as two types` and of `Done`, as spec-graph reads
 * a register's status.
 */
export function statusWord(status: string): string {
  return status.trim().split(/[\s:;,(]/)[0]!.toLowerCase();
}
