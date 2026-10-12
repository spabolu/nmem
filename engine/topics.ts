/**
 * Topics: the tree, formed after classification, and one page per topic. File overlap seeds membership, a file may sit
 * on more than one topic, and Start here, headline sources, and the example are lines or sentences at HEAD that the
 * model names by handle. Code computes every range and checks every path, so a bad pick is refused, never repaired.
 */
import type { LocalId, Named, RecordSource, Said, Topic } from '../harness/contract.ts';
import { JARGON } from '../fixtures/lib/plain.mjs';
import { ModelUnavailable } from './copilot.ts';
import type { ModelClient } from './copilot.ts';
import { arr, ask, lengthProblems, named, nullable, obj, OPUS, plainProblems, str, words } from './model.ts';
import type { Gated, Task } from './model.ts';
import type { FileObject, Line, RepoRecord, Sentence } from './record.ts';
import { ROOT } from './steps.ts';
import type { Placeable, TreeSignals } from './steps.ts';

const PLAIN_RULE = `plain is for someone who does not read code. It names no file, function, option, flag, command, code, commit id, or number with a number sign, and none of these words: ${JARGON.join(', ')}.`;
const MAX_SHOWN = 1500;
const MAX_START = 40;

function isTest(path: string): boolean {
  return /(?:^|\/)(?:test|tests)\//.test(path);
}

/** Markdown at HEAD a topic may list as its doc. A superseded ADR is history, not a doc. */
function writtenDocs(record: RepoRecord): readonly FileObject[] {
  return record.docs.filter((doc) => !doc.sentences.some((sentence) => sentence.flags.includes('superseded')));
}

function indent(text: string): number {
  return /^\s*/.exec(text)?.[0].length ?? 0;
}

/**
 * Start here from its first line: through the indented block under it, a closing line of brackets included, at most
 * 40 lines, trailing blank lines left out.
 */
function startRange(file: FileObject, first: number): { readonly from: number; readonly to: number } {
  const lines = file.lines;
  const base = indent(lines[first - 1]?.text ?? '');
  let to = first;
  for (let n = first + 1; n <= lines.length && n - first < MAX_START; n += 1) {
    const text = lines[n - 1]?.text ?? '';
    if (text.trim() === '') continue;
    if (indent(text) <= base && !/^\s*[)\]}]+[,;]?\s*$/.test(text)) break;
    to = n;
  }
  return { from: first, to };
}

type Handles = { readonly lines: Map<string, { readonly file: FileObject; readonly line: Line }>; readonly sentences: Map<string, Sentence> };

function emptyHandles(): Handles {
  return { lines: new Map(), sentences: new Map() };
}

/** A file's lines with handles on every non-blank line, numbered on from the handles already given. */
function showLines(file: FileObject, handles: Handles, out: string[]): void {
  for (const line of file.lines) {
    if (line.text.trim() === '') {
      out.push('');
      continue;
    }
    const handle = `L${handles.lines.size + 1}`;
    handles.lines.set(handle, { file, line });
    out.push(`[${handle}] ${line.text}`);
  }
}

function showSentences(file: FileObject, handles: Handles, out: string[]): void {
  for (const sentence of file.sentences) {
    const handle = `S${handles.sentences.size + 1}`;
    handles.sentences.set(handle, sentence);
    out.push(`[${handle}] ${sentence.text.replace(/\s+/g, ' ')}`);
  }
}

type FormInput = { readonly text: string; readonly handles: Handles; readonly paths: ReadonlySet<string>; readonly docs: ReadonlySet<string> };

function formInputOf(record: RepoRecord, signals: TreeSignals): FormInput {
  const handles = emptyHandles();
  const out = ['Files at HEAD. Only lines with a handle can be Start here.'];
  let shown = 0;
  for (const file of record.files.filter((item) => !/\.(md|markdown)$/i.test(item.path))) {
    const tag = isTest(file.path) ? ', a test' : '';
    if (file.path.startsWith('.') || shown + file.lines.length > MAX_SHOWN) {
      out.push(`${file.path} (${file.lines.length} lines${tag}, not shown)`);
      continue;
    }
    shown += file.lines.length;
    out.push('', `${file.path} (${file.lines.length} lines${tag}):`);
    showLines(file, handles, out);
  }
  const docs = writtenDocs(record);
  const title = (doc: FileObject): string => doc.sentences.find((sentence) => sentence.unit === 'heading')?.text ?? doc.sentences[0]?.text ?? '';
  out.push('', 'Written docs at HEAD:');
  for (const doc of docs) out.push(`${doc.path}: ${title(doc)}`);
  out.push('', 'Decision records at HEAD:');
  for (const adr of record.adrs) out.push(`${adr.file.path}: ${title(adr.file)}${adr.status.kind === 'superseded' ? ' (superseded, so never a doc)' : ''}`);
  out.push('', 'Decisions and findings from the history, with the files each is about:');
  for (const item of signals.items) out.push(`- ${item.kind}: ${item.what} (${item.files.join(', ') || 'no files'})`);
  return { text: out.join('\n'), handles, paths: new Set(record.files.map((file) => file.path)), docs: new Set(docs.map((doc) => doc.path)) };
}

const FORM_ANSWER = obj({
  topics: arr(obj({ slug: str, parent: nullable(str), name: named, files: arr(str), docs: arr(str), words: arr(str), start: str })),
});
type FormAnswer = ReturnType<typeof FORM_ANSWER.parse>;

const FORM: Task<FormInput, FormAnswer> = {
  id: 'form-topics',
  version: 2,
  model: OPUS,
  maxOutputTokens: 4000,
  rules: `You group a software repository into topics for a read-only map of what the code does. Its readers are engineers and people who do not read code. A reader picks a topic and reads what that part does, the decisions behind it, and where to start reading.

Answer with handles only: [L#] is a line at HEAD. Code copies its text, so never quote and never make up a handle.

Return the root first, with slug "root", parent null, and files []. Then the topics under it, grouped by what the code does for its users, not by directory. Use 2 to 9 topics under the root, and nest a topic under another only when it is part of it. A decision or finding from the history may shape a topic, such as a choice that set how one part behaves.
For each topic:
- slug: one lowercase word, letters and digits only, unique.
- parent: the slug of its parent, or null for the root.
- name: 2 to 5 words per audience.
- files: the paths at HEAD that make up this topic. A file may sit on more than one topic when it holds a part of each, a test sits with the code it checks, and a decision record from the list sits with the topic it governs, even when superseded.
- docs: written docs from the list that describe this topic, or [] when none does.
- words: up to 6 search words.
- start: the [L#] line where a newcomer should start reading, usually the first line of the function or block that does the topic's main work.

eng may name code. ${PLAIN_RULE}`,
  render: (input) => input.text,
  answer: FORM_ANSWER,
};

/** A topic before its page: everything but headline and example. */
type Skeleton = Omit<Topic, 'headline' | 'example'>;

function gateForm(record: RepoRecord, input: FormInput, answer: FormAnswer): Gated<readonly Skeleton[]> {
  const problems: string[] = [];
  const head7 = record.head.slice(0, 7);
  const roots = answer.topics.filter((topic) => topic.parent === null);
  if (roots.length !== 1) problems.push(`topics: expected exactly one root, got ${roots.length}`);
  const rootSlug = roots[0]?.slug ?? ROOT;
  const idOf = (slug: string): LocalId => (slug === rootSlug ? ROOT : slug);
  const slugs = new Set<string>();
  const kept: Skeleton[] = [];
  answer.topics.forEach((raw, i) => {
    const where = `topics[${i}]`;
    const bad: string[] = [];
    if (raw.parent !== null && !/^[a-z][a-z0-9]*$/.test(raw.slug)) bad.push(`${where}.slug: ${raw.slug} is not one lowercase word`);
    if (slugs.has(raw.slug)) bad.push(`${where}.slug: ${raw.slug} is used twice`);
    if (raw.parent !== null && !answer.topics.some((other) => other.slug === raw.parent)) bad.push(`${where}.parent: ${raw.parent} is not a slug`);
    const files = raw.parent === null ? [] : raw.files;
    const missing = files.filter((file) => !input.paths.has(file));
    if (missing.length > 0) bad.push(`${where}.files: ${missing.join(', ')} not at HEAD`);
    const notDocs = raw.docs.filter((doc) => !input.docs.has(doc));
    if (notDocs.length > 0) bad.push(`${where}.docs: ${notDocs.join(', ')} not a written doc at HEAD`);
    bad.push(...plainProblems(`${where}.name`, raw.name), ...lengthProblems(`${where}.name`, raw.name, 5));
    const start = input.handles.lines.get(raw.start);
    if (!start) bad.push(`${where}.start: ${raw.start} is not an [L#] handle`);
    if (bad.length > 0 || !start) return void problems.push(...bad);
    slugs.add(raw.slug);
    const range = startRange(start.file, start.line.number);
    kept.push({
      id: idOf(raw.slug),
      parent: raw.parent === null ? null : idOf(raw.parent),
      name: raw.name,
      files: [...new Set(files)],
      words: raw.words,
      start: { kind: 'record', ref: `${head7}:${start.file.path}#L${range.from}-L${range.to}`, quote: start.line.text },
      docs: [...new Set(raw.docs)],
    });
  });
  const ids = new Set(kept.map((topic) => topic.id));
  const rooted = (topic: Skeleton): boolean => {
    const seen = new Set<LocalId>();
    let at: Skeleton | undefined = topic;
    while (at && at.parent !== null) {
      if (seen.has(at.id)) return false;
      seen.add(at.id);
      const parent: LocalId = at.parent;
      at = kept.find((other) => other.id === parent);
    }
    return at?.parent === null;
  };
  const tree = kept.filter((topic) => ids.has(ROOT) && rooted(topic));
  if (tree.length !== kept.length) problems.push('topics: some topics do not reach the root');
  return { value: tree, problems };
}

type PageInput = { readonly text: string; readonly handles: Handles };

function pageInputOf(record: RepoRecord, tree: readonly Skeleton[], topic: Skeleton): PageInput {
  const handles = emptyHandles();
  const parent = tree.find((other) => other.id === topic.parent);
  const out = [`Topic: ${topic.name.eng}${parent ? `, part of ${parent.name.eng}` : ', the whole repository'}.`];
  const startPath = topic.start.ref.replace(/^[^:]+:/, '').replace(/#.*$/, '');
  const code = record.files.filter((file) => (topic.files.includes(file.path) || file.path === startPath) && !/\.(md|markdown)$/i.test(file.path) && !isTest(file.path));
  const tests = record.files.filter((file) => isTest(file.path) && (topic.files.includes(file.path) || topic.parent === null || !topic.files.some(isTest)));
  const docs = record.docs.filter((doc) => topic.docs.includes(doc.path) || (topic.parent === null && /^readme\.(md|markdown)$/i.test(doc.path)));
  let shown = 0;
  for (const [title, files] of [['Code', code], ['Tests', tests]] as const) {
    for (const file of files) {
      if (shown + file.lines.length > MAX_SHOWN) continue;
      shown += file.lines.length;
      out.push('', `${title}: ${file.path}`);
      showLines(file, handles, out);
    }
  }
  for (const doc of docs) {
    out.push('', `Doc: ${doc.path}`);
    showSentences(doc, handles, out);
  }
  return { text: out.join('\n'), handles };
}

const PAGE_ANSWER = obj({
  headline: arr(obj({ eng: str, plain: str, source: str }), { min: 1, max: 3 }),
  example: nullable(obj({ eng: str, plain: str, source: str })),
});
type PageAnswer = ReturnType<typeof PAGE_ANSWER.parse>;

const PAGE: Task<PageInput, PageAnswer> = {
  id: 'write-page',
  version: 1,
  model: OPUS,
  maxOutputTokens: 2000,
  rules: `You write the top of one topic's page in a read-only map of a software repository. Its readers are engineers and people who do not read code.

Answer with handles only: [L#] is a line of code or a test at HEAD, and [S#] is a sentence of a written doc. Code copies the text, so never quote and never make up a handle.
- headline: one to three sentences that say what this part does, at most 45 words in total per audience. Each rests on the one [L#] or [S#] that shows it, given as source. The answer comes first.
- example: one concrete case taken from a test, such as an input and the result the test expects, resting on the [L#] test line that checks it. null when no test shown here checks this topic.
Say only what the code, tests, and docs shown here say. Never say why anything was chosen.

eng may name code. ${PLAIN_RULE}`,
  render: (input) => input.text,
  answer: PAGE_ANSWER,
};

type Page = { readonly headline: readonly [Said, ...Said[]]; readonly example: Said | null };

function sourceOf(record: RepoRecord, handles: Handles, handle: string): { readonly source: RecordSource; readonly path: string } | null {
  const head7 = record.head.slice(0, 7);
  const line = handles.lines.get(handle);
  if (line) return line.line.text.trim() === '' ? null : { source: { kind: 'record', ref: `${head7}:${line.file.path}`, quote: line.line.text.trim() }, path: line.file.path };
  const sentence = handles.sentences.get(handle);
  return sentence ? { source: { kind: 'record', ref: sentence.ref, quote: sentence.text }, path: sentence.ref.replace(/^[^:]+:/, '') } : null;
}

function gatePage(record: RepoRecord, input: PageInput, answer: PageAnswer): Gated<Page | null> {
  const problems: string[] = [];
  const headline: Said[] = [];
  answer.headline.forEach((raw, i) => {
    const where = `headline[${i}]`;
    const found = sourceOf(record, input.handles, raw.source);
    const text: Named = { eng: raw.eng, plain: raw.plain };
    const bad = [...(found ? [] : [`${where}.source: ${raw.source} is not an [L#] or [S#] handle with text`]), ...plainProblems(where, text)];
    if (bad.length > 0 || !found) problems.push(...bad);
    else headline.push({ ...text, source: found.source });
  });
  const fits = (count: number): boolean => (['eng', 'plain'] as const).every((audience) => words(headline.slice(0, count).map((said) => said[audience]).join(' ')) <= 45);
  let kept = headline.length;
  while (kept > 0 && !fits(kept)) kept -= 1;
  if (kept < headline.length) problems.push(`headline: over 45 words in total per audience, so only the first ${kept} sentences fit`);
  let example: Said | null = null;
  if (answer.example !== null) {
    const found = sourceOf(record, input.handles, answer.example.source);
    const text: Named = { eng: answer.example.eng, plain: answer.example.plain };
    const bad = [...(found && isTest(found.path) ? [] : [`example.source: ${answer.example.source} is not a test line`]), ...plainProblems('example', text), ...lengthProblems('example', text, 30)];
    if (bad.length > 0 || !found) problems.push(...bad);
    else example = { ...text, source: found.source };
  }
  const [first, ...rest] = headline.slice(0, kept);
  return { value: first === undefined ? null : { headline: [first, ...rest], example }, problems };
}

/**
 * The tree and its pages. A form that fails twice leaves the floor's root alone. A topic whose page fails twice is
 * dropped, and its children move up to its parent. The root keeps the floor's page when its own fails.
 */
export async function formTopics(record: RepoRecord, client: ModelClient, signals: TreeSignals, floorRoot: Topic, note: (line: string) => void): Promise<readonly [Topic, ...Topic[]]> {
  const input = formInputOf(record, signals);
  const formed = await ask(client, FORM, input, 'form topics', (answer) => gateForm(record, input, answer));
  formed.problems.forEach((line) => note(`topics ${line}`));
  const skeletons = formed.value;
  if (!skeletons.some((topic) => topic.id === ROOT)) return [floorRoot];
  const pages = await Promise.all(skeletons.map(async (topic) => {
    const page = pageInputOf(record, skeletons, topic);
    try {
      const written = await ask(client, PAGE, page, `page ${topic.id}`, (answer) => gatePage(record, page, answer));
      written.problems.forEach((line) => note(`page ${topic.id} ${line}`));
      return written.value;
    } catch (error) {
      if (!(error instanceof ModelUnavailable && error.reason === 'bad-reply')) throw error;
      note(`page ${topic.id} fell back: ${error.message}`);
      return null;
    }
  }));
  const dropped = new Set(skeletons.filter((topic, i) => topic.id !== ROOT && pages[i] === null).map((topic) => topic.id));
  const parentOf = (id: LocalId | null): LocalId | null => {
    let at = id;
    while (at !== null && dropped.has(at)) at = skeletons.find((topic) => topic.id === at)?.parent ?? ROOT;
    return at;
  };
  const topics = skeletons.flatMap((topic, i): Topic[] => {
    if (dropped.has(topic.id)) return [];
    const page = pages[i];
    if (topic.id === ROOT) return [page ? { ...floorRoot, name: topic.name, words: topic.words, start: topic.start, docs: topic.docs, headline: page.headline, example: page.example } : floorRoot];
    return page ? [{ ...topic, parent: parentOf(topic.parent), headline: page.headline, example: page.example }] : [];
  });
  const root = topics.find((topic) => topic.id === ROOT) ?? floorRoot;
  return [root, ...topics.filter((topic) => topic.id !== ROOT)];
}

/** Topics whose files hold any of these paths: the candidates an item may be placed on. */
export function overlapping(tree: readonly Topic[], files: readonly string[]): readonly LocalId[] {
  return tree.filter((topic) => topic.parent !== null && topic.files.some((file) => files.includes(file))).map((topic) => topic.id);
}

const PLACE_ANSWER = obj({ picks: arr(obj({ key: str, topics: arr(str) })) });
type PlaceInput = { readonly tree: readonly Topic[]; readonly items: readonly Placeable[] };

const PLACE: Task<PlaceInput, ReturnType<typeof PLACE_ANSWER.parse>> = {
  id: 'place',
  version: 1,
  model: OPUS,
  maxOutputTokens: 3000,
  rules: `Answer only by calling the answer tool, with no other text.

You place decisions and findings from a repository's history on the topics of its map. Each item lists candidate topics, the ones whose files it touches. Pick the candidates the item is about, usually one. A file shared by many topics, such as a command-line entry point, is weak evidence. Never pick a topic outside an item's candidates. Return one pick for every item.`,
  render: (input) => [
    'Topics:',
    ...input.tree.filter((topic) => topic.parent !== null).map((topic) => `${topic.id}: ${topic.name.eng}. Files: ${topic.files.join(', ')}`),
    '',
    'Items:',
    ...input.items.map((item) => `${item.key} (${item.kind}): ${item.what} Candidates: ${item.candidates.join(', ')}`),
  ].join('\n'),
  answer: PLACE_ANSWER,
};

/** Items with one candidate or none need no call. The rest get one batched call, and any item it leaves out keeps all its candidates. */
export async function placeItems(client: ModelClient, tree: readonly Topic[], items: readonly Placeable[], note: (line: string) => void): Promise<ReadonlyMap<string, readonly LocalId[]>> {
  const placed = new Map(items.map((item) => [item.key, item.candidates]));
  const open = items.filter((item) => item.candidates.length > 1);
  if (open.length === 0) return placed;
  const picked = await ask(client, PLACE, { tree, items: open }, 'place', (answer) => {
    const problems: string[] = [];
    const value = new Map<string, readonly LocalId[]>();
    for (const pick of answer.picks) {
      const item = open.find((entry) => entry.key === pick.key);
      const outside = pick.topics.filter((id) => !item?.candidates.includes(id));
      if (!item || outside.length > 0 || pick.topics.length === 0) problems.push(`picks: ${pick.key} must pick among its candidates ${item?.candidates.join(', ') ?? '(no such item)'}`);
      else value.set(pick.key, [...new Set(pick.topics)]);
    }
    const left = open.filter((item) => !value.has(item.key));
    if (left.length > 0) problems.push(`picks: no pick for ${left.map((item) => item.key).join(', ')}`);
    return { value, problems };
  });
  picked.problems.forEach((line) => note(`place ${line}`));
  for (const [key, topics] of picked.value) placed.set(key, topics);
  return placed;
}
