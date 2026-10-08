/**
 * Moderated user sessions on the same 93 questions. `cards` writes a participant directory: one card per question, a
 * blank answer sheet, and the same scrubbed workspace a system gets. The map that binds a card back to an answer-key
 * entry is written only under sessionsDir, which is harness-private.
 *
 * `run --sheets` reads filled sheets back. A person writes free text, so the judge's `segment` task cuts each answer
 * into record / inference / unknown statements with their citations, and protocol.parseStatements takes it from there.
 * The scorer is the same one systems go through. Every score built this way is labelled judge-segmented.
 */
import type { EntryId, ItemKey, Slug } from './key.ts';
import type { Audience, ModelFamily, RepoIdentity } from './protocol.ts';

export type CardSetId = string & { readonly __brand: 'CardSetId' };
export type CardId = string & { readonly __brand: 'CardId' };

/** What a participant sees for one question. No entry id, no job, no expectation, no hint of the key. */
export type Card = {
  readonly id: CardId;
  readonly repo: RepoIdentity;
  readonly question: string;
  readonly audiences: readonly [Audience, ...Audience[]];
};

/** Harness-private. Never written under the participant directory. */
export type CardMap = {
  readonly set: CardSetId;
  readonly createdAt: string;
  readonly cards: ReadonlyMap<CardId, { readonly slug: Slug; readonly entry: EntryId }>;
};

export type CardsOptions = {
  readonly outDir: string;
  readonly sessionsDir: string;
  readonly participantDir: string;
  readonly slugs: readonly Slug[];
  readonly only: ReadonlySet<ItemKey> | null;
  readonly audiences: readonly [Audience, ...Audience[]];
};

export async function writeCards(options: CardsOptions): Promise<CardSetId> {
  // TODO:
  // 1. Refuse when participantDir is inside sessionsDir, outDir, or the nmem checkout, or the reverse.
  // 2. set = fresh random id. card id = "q-" + hashOf(set secret, slug, entry) first 10 hex. Order shuffled, seeded by set.
  // 3. participantDir/
  //      README.md                      how to fill the sheet, in neutral words
  //      cards/<nn>-<cardId>.md          question, repo name, audiences to answer
  //      sheet.json                      { set, participant: "", condition: "", modelFamilies: [],
  //                                        answers: [{ card, technical: "", plain: "", links: [], seconds: null }] }
  //      workspaces/<repo name>/         record.buildWorkspace, the same scrub a system gets
  //    sessionsDir/<set>/map.json        CardMap, written by temp file and rename
  // 4. auditCardDir(participantDir, ...): every entry id, every "<slug>/<entry>" pair, the string "map.json", and every
  //    key canary must be absent from every file and path under participantDir. Any hit deletes participantDir and throws.
  throw new Error('not implemented');
}

export type SheetAnswer = {
  readonly card: CardId;
  /** Free text per requested audience. A missing or blank audience is unanswered, not a protocol error. */
  readonly text: Readonly<Partial<Record<Audience, string>>>;
  /** Links or locators the participant pasted. Mentions inside the text ("PR #16 says") count too. */
  readonly links: readonly string[];
  /** Timed by the moderator. Reported as cost, apart from quality, like a system's latency. */
  readonly seconds: number | null;
};

export type Sheet = {
  readonly set: CardSetId;
  readonly participant: string;
  /** "nmem", "github-and-agent", or any label. A condition is the subject the report compares. */
  readonly condition: string;
  /** Model families of any agent the participant used. Checked against the judge's family like a system's. */
  readonly modelFamilies: readonly ModelFamily[];
  readonly answers: readonly SheetAnswer[];
};

export function parseSheet(file: string): Sheet {
  // TODO: reject unknown keys; participant and condition non-empty and path-safe; card ids unique within the sheet.
  throw new Error('not implemented');
}

export function readSheets(dir: string, sessionsDir: string): { readonly map: CardMap; readonly sheets: readonly Sheet[] } {
  // TODO: every sheet in dir shares one set, and sessionsDir/<set>/map.json exists. A card id not in the map is an
  // error naming the file and the card. Two sheets from the same (participant, condition) are an error.
  throw new Error('not implemented');
}
