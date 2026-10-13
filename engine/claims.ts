/**
 * Doc claims. A written doc sentence becomes a claim only when it can be cited as not plainly true at HEAD:
 * no-longer-true or depends with the change that broke it, or true-since with the change that made it true. Every other
 * sentence stays silent, which reads as still true, and anything unsure is left out.
 *
 * The model lists the sentences the code decides, writes a program that tests one against the repo's own code, and
 * judges the outcome. Code runs the program at HEAD and at every change since the sentence was written, so the change a
 * claim names comes from git and the runs, never from the model.
 */
import { createHash } from 'node:crypto';
import type { ChangeId, Claim, LocalId, RecordSource, Run, Said, Topic } from '../harness/contract.ts';
import { formatProof, runProof } from '../fixtures/lib/checks.mjs';
import { EMPTY_TREE } from '../fixtures/lib/facts.mjs';
import { git } from '../fixtures/lib/git.mjs';
import { JARGON } from '../fixtures/lib/plain.mjs';
import { isTestFile } from '../fixtures/lib/tests.mjs';
import { ModelUnavailable } from './copilot.ts';
import type { ModelClient } from './copilot.ts';
import { arr, ask, lengthProblems, lit, named, nullable, obj, OPUS, plainProblems, str } from './model.ts';
import type { Gated, Task } from './model.ts';
import { isDoc } from './record.ts';
import type { FileObject, Line, RepoRecord, Sentence } from './record.ts';
import { collapse } from './steps.ts';

const PLAIN_RULE = `plain is for someone who does not read code. It names no file, function, option, flag, command, code, commit id, or number with a number sign, and none of these words: ${JARGON.join(', ')}.`;
const MAX_SHOWN = 1500;

type Lang = 'python' | 'node';
type Probe = { readonly kind: 'holds' | 'fails' | 'error'; readonly text: string };
type Evidence = { readonly file: FileObject; readonly line: Line };

type CodeView = { readonly text: string; readonly lines: ReadonlyMap<string, Evidence> };

function codeViewOf(record: RepoRecord): CodeView {
  const lines = new Map<string, Evidence>();
  const out = ['Code and tests at HEAD. Only lines with a handle can be evidence.'];
  let shown = 0;
  for (const file of record.files.filter((item) => !isDoc(item.path) && !item.path.startsWith('.'))) {
    if (shown + file.lines.length > MAX_SHOWN) {
      out.push('', `${file.path} (${file.lines.length} lines, not shown)`);
      continue;
    }
    shown += file.lines.length;
    out.push('', `${file.path}${isTestFile(file.path) ? ' (a test)' : ''}:`);
    for (const line of file.lines) {
      if (line.text.trim() === '') {
        out.push('');
        continue;
      }
      const handle = `L${lines.size + 1}`;
      lines.set(handle, { file, line });
      out.push(`[${handle}] ${line.text}`);
    }
  }
  return { text: out.join('\n'), lines };
}

/** The language a check program is written in, from the code at HEAD, or null when nothing here can run one. */
function langOf(record: RepoRecord): Lang | null {
  const count = (pattern: RegExp): number => record.files.filter((file) => pattern.test(file.path)).length;
  const python = count(/\.py$/);
  const node = count(/\.(js|mjs|cjs)$/);
  if (python === 0 && node === 0) return null;
  return python >= node ? 'python' : 'node';
}

type ListInput = { readonly doc: FileObject; readonly code: CodeView; readonly sentences: ReadonlyMap<string, Sentence> };
const LIST_ANSWER = obj({ claims: arr(obj({ sentence: str, evidence: str, runnable: lit('yes', 'no') })) });

const LIST: Task<ListInput, ReturnType<typeof LIST_ANSWER.parse>> = {
  id: 'doc-claims',
  version: 1,
  model: OPUS,
  maxOutputTokens: 2000,
  rules: `Answer only by calling the answer tool, with no other text.

You read one written doc of a software repository to find the sentences that code can prove or disprove today. A later step tests each one.

Answer with handles only: [S#] is a sentence of the doc and [L#] is a line of code or a test at HEAD. Never quote and never make up a handle.
List a sentence only when it states, in the present tense, something the code decides: a behavior, a default, an order, a limit, a name, or a format. Skip headings, instructions to the reader, history, people, plans, and opinions.
- evidence: the one [L#] line at HEAD that most directly decides whether the sentence holds.
- runnable: yes when running the program's own code with chosen inputs can test the sentence, else no.
Example: a doc says "Retries stop after three attempts." and [L12] is "MAX_RETRIES = 3". List it with evidence L12, runnable yes.
Return an empty list when no sentence qualifies.`,
  render: (input) => [`Doc: ${input.doc.path}`, ...[...input.sentences].map(([handle, sentence]) => `[${handle}] ${collapse(sentence.text)}`), '', input.code.text].join('\n'),
  answer: LIST_ANSWER,
};

type ProgramInput = { readonly lang: Lang; readonly doc: string; readonly sentence: string; readonly around: string; readonly code: string };
const PROGRAM_ANSWER = obj({ program: nullable(str) });

const PROGRAM: Task<ProgramInput, ReturnType<typeof PROGRAM_ANSWER.parse>> = {
  id: 'check-claim',
  version: 3,
  model: OPUS,
  maxOutputTokens: 4000,
  rules: `Answer only by calling the answer tool, with no other text.

You write one program that tests whether a sentence in a repository's docs holds for the code. It runs from the repository root in a scratch copy with no network, at HEAD and again at older revisions, to find when the sentence started or stopped holding.
- Import or invoke the repository's own code, the way the doc tells its reader to use it. Rely on defaults: pass only the options and arguments the test needs, because names can differ at older revisions. The scratch copy is yours, so files the program writes may go wherever the code puts them by default.
- If the code cannot be called the way you expect (a missing module, function, option, or command), let the program crash. Never report that as a failed case.
- Test what this sentence itself states. When it points back ("that", "it"), take the meaning from the earlier sentence and test this sentence's own part, such as every repetition of the earlier step. When the doc describes steps or promises a best result, build the reference from the doc's words (follow the described steps, or search every option for the best one) and compare the code's output with it.
- Cover the doc's own example, typical cases, and larger cases. Go through every small combination up to a bound, not random samples, so the output is the same on every run.
- Print result lines only. One "ok: ..." line per size or kind of case that passed, with a count, such as "ok: all 120 orders of 2 to 4 items keep their order". One "no: ..." line per failing case with its size and what happened, at most 5.
- At most 40 lines, under 10 seconds.
Answer program null when running this code cannot test the sentence.`,
  render: (input) => [`Language: ${input.lang}`, `Doc: ${input.doc}`, `Sentence: ${input.sentence}`, `Its paragraph: ${input.around}`, '', input.code].join('\n'),
  answer: PROGRAM_ANSWER,
};

type VerdictInput = { readonly sentence: string; readonly around: string; readonly evidence: string; readonly output: string | null };
const VERDICT_ANSWER = obj({ verdict: lit('holds', 'no-longer-true', 'depends', 'unsure'), why: nullable(named), plainWhat: nullable(str) });
type VerdictAnswer = ReturnType<typeof VERDICT_ANSWER.parse>;

const VERDICT: Task<VerdictInput, VerdictAnswer> = {
  id: 'claim-verdict',
  version: 3,
  model: OPUS,
  maxOutputTokens: 1500,
  rules: `Answer only by calling the answer tool, with no other text.

You judge whether one sentence of a repository's docs holds for its code today, from the code and, when there is one, the output of a program that tested it ("ok:" lines passed, "no:" lines failed).
Judge the sentence as its reader uses it: in the setup the docs describe, about the details it chooses to mention. A sentence that simplifies, leaves out a detail, or describes a format loosely holds when what it does say is right. A failure that comes from the program, not the code, makes the verdict unsure. Judge only what this sentence states: when the failures come from a part of the paragraph this sentence does not state, it holds.
- verdict: depends when the sentence holds in the ordinary case the doc describes and fails under another condition the code supports, such as a larger size, another setting, or another platform version. no-longer-true when it fails in the ordinary case. holds when it holds. unsure when you cannot tell.
- why: one sentence per audience, at most 40 words each, saying what the program showed, or what the code does when nothing ran. Never say why anyone chose anything. null when verdict is holds or unsure.
- plainWhat: a plain noun phrase of at most 10 words for what the evidence line does, such as "the check that stops an empty order". null when you cannot write one.
Example: "Retries stop after three attempts." with output "ok: 1 to 3 failures retried", "no: 4 failures, retried 6 times". verdict no-longer-true; why eng "With 4 failures in a row the client retried 6 times, not 3."

eng is for engineers and may name code. ${PLAIN_RULE}`,
  render: (input) => [`Sentence: ${input.sentence}`, `Its paragraph: ${input.around}`, '', `Code around the evidence line:\n${input.evidence}`, '', input.output === null ? 'No program ran.' : `Program output at HEAD:\n${input.output}`].join('\n'),
  answer: VERDICT_ANSWER,
};

/** A doc's sentences that read as running text: prose and list items, not headings. */
function sentencesOf(doc: FileObject): Map<string, Sentence> {
  return new Map(doc.sentences.filter((sentence) => sentence.unit !== 'heading').map((sentence, i) => [`S${i + 1}`, sentence]));
}

function lineSpan(doc: FileObject, sentence: Sentence): { readonly from: number; readonly to: number } {
  const from = doc.text.slice(0, sentence.start).split('\n').length;
  return { from, to: from + sentence.text.split('\n').length - 1 };
}

function paragraphOf(doc: FileObject, sentence: Sentence): string {
  const before = doc.text.lastIndexOf('\n\n', sentence.start);
  const after = doc.text.indexOf('\n\n', sentence.start + sentence.text.length);
  return collapse(doc.text.slice(before < 0 ? 0 : before, after < 0 ? doc.text.length : after));
}

function around(evidence: Evidence, radius = 15): string {
  const { file, line } = evidence;
  return file.lines.slice(Math.max(0, line.number - 1 - radius), line.number + radius).map((item) => `${item.number === line.number ? '>' : ' '} ${item.text}`).join('\n');
}

/** Each commit on main, by full sha, to the change that put it there. */
function commitChanges(record: RepoRecord): ReadonlyMap<string, ChangeId> {
  const owner = new Map<string, ChangeId>();
  for (const change of record.changes) {
    const range = change.before === EMPTY_TREE ? [change.after] : [change.after, `^${change.before}`];
    for (const sha of git(record.repoDir, ['rev-list', ...range]).stdout.split('\n').filter(Boolean)) owner.set(sha, change.id);
  }
  return owner;
}

/** A run's scratch paths differ on every run, so they never reach a prompt, whose text is the cache key. */
function scrubbed(text: string): string {
  return text.replace(/(?:\/private)?\/(?:var\/folders|tmp)\/\S*?(?=[\s'":,)]|$)/g, '<scratch>');
}

function probe(repoDir: string, run: Run): Probe {
  const out = runProof(repoDir, { verb: 'run', id: run.id }, [run]) as { failed?: string; detail?: string; text?: string };
  if (out.failed) return { kind: 'error', text: `${out.failed}: ${scrubbed(out.detail ?? '')}`.slice(0, 1500) };
  const text = out.text ?? '';
  const results = text.split('\n').filter((line) => /^(ok|no):/.test(line));
  if (results.length === 0) return { kind: 'error', text: `printed no "ok:" or "no:" line. Output: ${scrubbed(text.slice(0, 800))}` };
  return { kind: results.some((line) => line.startsWith('no:')) ? 'fails' : 'holds', text };
}

function runOf(lang: Lang, rev: string, source: string): Run {
  return { id: `check${createHash('sha256').update(source).digest('hex').slice(0, 8)}`, rev: rev as Run['rev'], lang, source };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function spelled(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${date}, ${year}`;
}

type Context = {
  readonly record: RepoRecord;
  readonly client: ModelClient;
  readonly note: (line: string) => void;
  readonly code: CodeView;
  readonly lang: Lang | null;
  readonly owner: ReadonlyMap<string, ChangeId>;
};

function changeIndex(record: RepoRecord, id: ChangeId | undefined): number {
  return id === undefined ? -1 : record.changes.findIndex((change) => change.id === id);
}

/** The change that last wrote any line of the sentence. */
function writtenBy(ctx: Context, doc: FileObject, sentence: Sentence): number {
  const { from, to } = lineSpan(doc, sentence);
  const blame = git(ctx.record.repoDir, ['blame', '--porcelain', '-L', `${from},${to}`, ctx.record.head, '--', doc.path]).stdout;
  const shas = [...blame.matchAll(/^([0-9a-f]{40}) \d+ \d+/gm)].map((match) => match[1] ?? '');
  return Math.max(-1, ...shas.map((sha) => changeIndex(ctx.record, ctx.owner.get(sha))));
}

/** The change that first added this line's text to its file, by `introduced`. */
function introducedBy(ctx: Context, evidence: Evidence): { readonly index: number; readonly sha7: string; readonly day: string; readonly author: string } | null {
  const needle = evidence.line.text.trim();
  const out = runProof(ctx.record.repoDir, { verb: 'introduced', path: evidence.file.path, needle }) as { text?: string };
  const found = /^first added in ([0-9a-f]{7}) on (\d{4}-\d{2}-\d{2}) by ([^;]+?)(?:;|$)/.exec(out.text ?? '');
  if (!found) return null;
  const sha = [...ctx.owner.keys()].find((full) => full.startsWith(found[1] ?? '-'));
  return { index: changeIndex(ctx.record, sha === undefined ? undefined : ctx.owner.get(sha)), sha7: found[1] ?? '', day: found[2] ?? '', author: found[3] ?? '' };
}

async function programFor(ctx: Context, lang: Lang, doc: FileObject, sentence: Sentence, writtenAt: string): Promise<{ readonly run: Run; readonly head: Probe } | null> {
  const input: ProgramInput = { lang, doc: doc.path, sentence: collapse(sentence.text), around: paragraphOf(doc, sentence), code: ctx.code.text.replace(/^\[L\d+\] /gm, '') };
  const gated = await ask(ctx.client, PROGRAM, input, `check ${doc.path}: ${collapse(sentence.text).slice(0, 60)}`, (answer): Gated<{ readonly run: Run; readonly head: Probe } | null> => {
    if (answer.program === null) return { value: null, problems: [] };
    const run = runOf(lang, ctx.record.head, answer.program);
    const head = probe(ctx.record.repoDir, run);
    if (head.kind === 'error') return { value: null, problems: [`the program failed at HEAD: ${head.text}`] };
    const then = writtenAt === ctx.record.head ? head : probe(ctx.record.repoDir, { ...run, rev: writtenAt as Run['rev'] });
    if (then.kind === 'error') return { value: { run, head }, problems: [`the program crashed at the older revision where the doc sentence was written, so it cannot tell when the sentence started or stopped holding: ${then.text}. It must run there too: rely on defaults and pass only what the test needs.`] };
    return { value: { run, head }, problems: [] };
  });
  return gated.value;
}

function gateVerdict(head: Probe | null, answer: VerdictAnswer): Gated<VerdictAnswer> {
  const problems: string[] = [];
  if (head?.kind === 'holds' && (answer.verdict === 'no-longer-true' || answer.verdict === 'depends')) problems.push('verdict: every line of the output passed, so the sentence cannot be judged false from it');
  if (head?.kind === 'fails' && answer.verdict === 'holds') problems.push('verdict: the output has a "no:" line, so holds needs it to be wrong, which is unsure');
  if ((answer.verdict === 'no-longer-true' || answer.verdict === 'depends') && answer.why === null) problems.push('why: a sentence that does not hold needs why');
  if (answer.why !== null) problems.push(...plainProblems('why', answer.why), ...lengthProblems('why', answer.why, 40));
  return { value: answer, problems };
}

/** One sentence to at most one claim, or null. */
async function checkSentence(ctx: Context, topics: readonly Topic[], doc: FileObject, sentence: Sentence, evidence: Evidence, runnable: boolean): Promise<{ readonly claim: Claim; readonly run: Run | null } | null> {
  const listing = topics.filter((topic) => topic.docs.includes(doc.path));
  const topic: LocalId | undefined = (listing.find((item) => item.files.includes(evidence.file.path)) ?? listing[0])?.id;
  if (topic === undefined) return null;
  const written = writtenBy(ctx, doc, sentence);
  const writtenAt = ctx.record.changes[written]?.after;
  if (writtenAt === undefined) return null;
  const program = runnable && ctx.lang !== null ? await programFor(ctx, ctx.lang, doc, sentence, writtenAt) : null;
  const label = `${doc.path}: ${collapse(sentence.text).slice(0, 60)}`;
  const input: VerdictInput = { sentence: collapse(sentence.text), around: paragraphOf(doc, sentence), evidence: `${evidence.file.path}\n${around(evidence)}`, output: program?.head.text ?? null };
  const judged = await ask(ctx.client, VERDICT, input, `verdict ${label}`, (answer) => gateVerdict(program?.head ?? null, answer));
  if (judged.problems.length > 0) return null;
  const { verdict, why, plainWhat } = judged.value;
  if (verdict === 'unsure') return null;
  const quote = { path: doc.path, quote: sentence.text };
  const introduced = introducedBy(ctx, evidence);
  if (program === null) {
    if (verdict === 'holds' || why === null || introduced === null) return null;
    const brokenBy = ctx.record.changes[Math.max(written, introduced.index)]?.id;
    if (brokenBy === undefined) return null;
    const source: RecordSource = { kind: 'record', ref: `${ctx.record.head.slice(0, 7)}:${evidence.file.path}`, quote: evidence.line.text.trim() };
    return { claim: { sentence: quote, topic, verdict, brokenBy, why: { ...why, source } }, run: null };
  }
  const since = ctx.record.changes.slice(written);
  const probes = since.map((change) => (change.after === ctx.record.head ? program.head : probe(ctx.record.repoDir, { ...program.run, rev: change.after as Run['rev'] })));
  if (verdict === 'holds') {
    const lastFail = probes.map((item) => item.kind).lastIndexOf('fails');
    const madeTrue = lastFail < 0 ? undefined : since[lastFail + 1];
    if (madeTrue === undefined || probes.slice(lastFail + 1).some((item) => item.kind !== 'holds')) return null;
    if (introduced !== null && introduced.index === changeIndex(ctx.record, madeTrue.id) && plainWhat !== null) {
      const needle = evidence.line.text.trim();
      const what = plainWhat.replace(/\.$/, '');
      const said: Said = {
        eng: `${introduced.author} added \`${needle}\` to ${evidence.file.path} in ${introduced.sha7}, on ${introduced.day}.`,
        plain: `${what.charAt(0).toUpperCase()}${what.slice(1)} was added on ${spelled(introduced.day)}, by ${introduced.author}.`,
        source: { kind: 'proof', proof: formatProof({ verb: 'introduced', path: evidence.file.path, needle }) },
      };
      if (plainProblems('why', said).length === 0) return { claim: { sentence: quote, topic, verdict: 'true-since', since: madeTrue.id, why: said }, run: null };
    }
    return null;
  }
  if (why === null) return null;
  let first = probes.length;
  while (first > 0 && probes[first - 1]?.kind === 'fails') first -= 1;
  const brokenBy = since[first]?.id;
  if (brokenBy === undefined || first === probes.length || probes[first - 1]?.kind === 'error') return null;
  return { claim: { sentence: quote, topic, verdict, brokenBy, why: { ...why, source: { kind: 'proof', proof: formatProof({ verb: 'run', id: program.run.id }) } } }, run: program.run };
}

/** Written docs at HEAD, in path order: every doc but a superseded decision record. */
function writtenDocs(record: RepoRecord): readonly FileObject[] {
  return record.docs.filter((doc) => !doc.sentences.some((sentence) => sentence.flags.includes('superseded'))).sort((a, b) => (a.path < b.path ? -1 : 1));
}

export async function docClaims(record: RepoRecord, client: ModelClient, topics: readonly Topic[], note: (line: string) => void): Promise<{ readonly claims: readonly Claim[]; readonly runs: readonly Run[] }> {
  const ctx: Context = { record, client, note, code: codeViewOf(record), lang: langOf(record), owner: commitChanges(record) };
  /** A bad reply costs only the doc or the sentence it was about, and is noted. */
  const settled = async <T>(label: string, work: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof ModelUnavailable && error.reason === 'bad-reply')) throw error;
      note(`claims ${label} fell back: ${error.message}`);
      return fallback;
    }
  };
  const perDoc = await Promise.all(writtenDocs(record).map((doc) => settled(doc.path, async () => {
    const sentences = sentencesOf(doc);
    if (sentences.size === 0) return [];
    const input: ListInput = { doc, code: ctx.code, sentences };
    const listed = await ask(client, LIST, input, `claims ${doc.path}`, (answer) => {
      const problems: string[] = [];
      const value = answer.claims.flatMap((item, i) => {
        const sentence = sentences.get(item.sentence);
        const evidence = ctx.code.lines.get(item.evidence);
        if (!sentence) problems.push(`claims[${i}].sentence: ${item.sentence} is not an [S#] handle`);
        if (!evidence) problems.push(`claims[${i}].evidence: ${item.evidence} is not an [L#] handle`);
        return sentence && evidence ? [{ sentence, evidence, runnable: item.runnable === 'yes' }] : [];
      });
      return { value, problems };
    });
    listed.problems.forEach((line) => note(`claims ${doc.path} ${line}`));
    const unique = listed.value.filter((item, i, all) => all.findIndex((other) => other.sentence.handle === item.sentence.handle) === i).sort((a, b) => a.sentence.start - b.sentence.start);
    return Promise.all(unique.map((item) => settled(`${doc.path}: ${collapse(item.sentence.text).slice(0, 60)}`, () => checkSentence(ctx, topics, doc, item.sentence, item.evidence, item.runnable), null)));
  }, [])));
  const found = perDoc.flat().filter((item): item is { readonly claim: Claim; readonly run: Run | null } => item !== null);
  const runs = found.flatMap((item) => (item.run ? [item.run] : [])).filter((run, i, all) => all.findIndex((other) => other.id === run.id) === i);
  return { claims: found.map((item) => item.claim), runs };
}
