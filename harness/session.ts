/**
 * The moderated user test. A participant answers answer-key questions on the nmem website rendered from one
 * condition: gold, one system's snapshot from a run, or GitHub only. It answers what no automated metric can, whether a
 * design's view errors cost a reader. Scores are labelled judge-scored and never ranked against systems.
 *
 * The card never carries a gold id, an entry id, a canary, or the fixture path. The map from card to entry lives only
 * under harness/sessions/<set>/.
 */
import type { SystemName } from './contract.ts';
import type { EntryId, Slug } from './gold.ts';
import type { RunId, TrialId } from './run.ts';
import type { Audience } from './view.ts';

export type CardSetId = string & { readonly __brand: 'CardSetId' };
export type CardId = string & { readonly __brand: 'CardId' };

export type SessionCondition =
  | { readonly kind: 'gold' }
  | { readonly kind: 'system'; readonly run: RunId; readonly system: SystemName; readonly trial: TrialId }
  | { readonly kind: 'github-only' };

/** What a participant sees: the question, the repo, and which setting (Engineer or Non-engineer) to read in. */
export type Card = { readonly id: CardId; readonly repo: string; readonly question: string; readonly audience: Audience };

/** Harness-private. */
export type CardMap = { readonly set: CardSetId; readonly condition: SessionCondition; readonly cards: ReadonlyMap<CardId, { readonly slug: Slug; readonly entry: EntryId }> };

/**
 * Writes the participant directory: cards, a blank sheet, the scrubbed workspace, and, for a snapshot condition, the
 * snapshot the website renders. Writes the map under sessionsDir. Then audits the participant directory for entry ids,
 * gold ids, canaries, and the map's name, and deletes it on any hit.
 */
export async function writeCards(options: { readonly participantDir: string; readonly sessionsDir: string; readonly slugs: readonly Slug[]; readonly condition: SessionCondition }): Promise<CardSetId> {
  throw new Error('not implemented');
}

export type SheetAnswer = {
  readonly card: CardId;
  readonly text: string;
  /** The screen the participant says they found it on. */
  readonly foundOn: string | null;
  /** Timed by the moderator. */
  readonly seconds: number | null;
};

export type Sheet = { readonly set: CardSetId; readonly participant: string; readonly answers: readonly SheetAnswer[] };

/** Rejects unknown keys, an empty participant, and card ids not in the set's map. */
export function parseSheet(file: string, sessionsDir: string): Sheet {
  throw new Error('not implemented');
}

/** check-facts of each answer against its entry's frozen key-answer headline facts, per condition, with n. */
export type SheetScores = {
  readonly condition: SessionCondition;
  readonly participants: number;
  readonly cards: { readonly correct: number; readonly partial: number; readonly wrong: number; readonly unanswered: number };
  readonly secondsPerCard: { readonly p50: number; readonly p95: number } | null;
};

export async function scoreSheets(dir: string, sessionsDir: string, factsDir: string): Promise<readonly SheetScores[]> {
  throw new Error('not implemented');
}
