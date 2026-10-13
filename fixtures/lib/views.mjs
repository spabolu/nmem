/**
 * The `views` key of a RepoSpec (typed in fixtures/views.schema.mjs). parseViews checks shape and every reference
 * that needs no repo. goldOf resolves the parsed views against the built repo and writes the private gold: every quote
 * is found, every proof runs through checks.mjs, every derived field comes from git or github.json, and every
 * hand-computed screen must equal what the harness kernel (harness/view.ts) computes from the gold.
 *
 * goldOf reads the record only through the port domain.mjs builds (viewsRecord), so this module never imports
 * domain.mjs and the dependency runs one way.
 */
import { kindOf, rangeOf, statusOf, TEMPLATES } from '../../harness/view.ts';
import { MIN_CURRENCY_CLAIMS, MIN_GAP_OBJECTS } from '../views.schema.mjs';
import { formatProof, MAX_RUN_SOURCE_BYTES, PROOF_VERBS, RUN_LANGS, runProof } from './checks.mjs';
import { EMPTY_TREE, factsOf } from './facts.mjs';
import { DENIAL } from './plain.mjs';
import { array, filePath, integer, nonEmpty, object, oneOf, positive, rejectUnknown, requireFields, SpecError } from './fields.mjs';
import { git, showFile } from './git.mjs';
import { isTestFile } from './tests.mjs';

const GOLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const TOPIC_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SCOPES = ['slice', 'full'];
const SEVERITIES = ['behavior', 'check'];
const COUNTED = ['decision', 'behavior', 'check', 'net'];
const NOTES = ['part-of-later-undo', 'undoes-earlier'];
const MAX_HEADLINE_WORDS = 45;
const MAX_POINTS = 3;
const TRUTH_GRAM = 6;

/** Each verb's spec fields and how they become the wire Proof (contract.ts) the runner takes. Revs are spec keys. */
const PROOF_SPECS = {
  grep: {
    revs: ['at'],
    strings: ['pattern'],
    optional: ['flags', 'paths'],
    wire: (p, rev) => ({ verb: 'grep', rev: rev(p.at), pattern: p.pattern, flags: p.flags, paths: p.paths }),
  },
  files: {
    revs: ['at'],
    optional: ['from'],
    wire: (p, rev) => ({ verb: 'files', from: p.from === null ? null : rev(p.from), to: rev(p.at) }),
  },
  diff: { revs: ['from', 'to'], wire: (p, rev) => ({ verb: 'diff', from: rev(p.from), to: rev(p.to) }) },
  restyle: { revs: ['from', 'to'], paths: ['path'], wire: (p, rev) => ({ verb: 'restyle', from: rev(p.from), to: rev(p.to), path: p.path }) },
  lockfile: { revs: ['from', 'to'], wire: (p, rev) => ({ verb: 'lockfile', from: rev(p.from), to: rev(p.to) }) },
  introduced: { paths: ['path'], strings: ['needle'], wire: (p) => ({ verb: 'introduced', path: p.path, needle: p.needle }) },
  run: { strings: ['id'], wire: (p) => ({ verb: 'run', id: p.id }) },
};

/** Verbs that name a file at HEAD, so they can show where a change's behavior lives now. */
const LIVES_IN_VERBS = ['grep', 'introduced'];

const VERDICT_FIELDS = {
  'still-true': [],
  'true-since': ['since', 'why'],
  'no-longer-true': ['brokenBy', 'why'],
  depends: ['brokenBy', 'why'],
};

const SCREEN_FIELDS = {
  timeline: { required: ['kind', 'topic', 'from', 'to', 'counts', 'named', 'routine'], optional: ['notes'] },
  page: { required: ['kind', 'topic', 'status'], optional: [] },
};

function words(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

function prose(value, path, ctx) {
  const s = nonEmpty(value, path, ctx);
  if (s.includes('\u2014')) ctx.fail(path, 'view text has no em dashes');
  return s;
}

function parseText(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['eng', 'plain']);
  requireFields(obj, path, ctx, ['eng', 'plain']);
  return { eng: prose(obj.eng, `${path}.eng`, ctx), plain: prose(obj.plain, `${path}.plain`, ctx) };
}

function nonNegative(value, path, ctx) {
  const n = integer(value, path, ctx);
  if (n < 0) ctx.fail(path, `expected a count of zero or more, got ${n}`);
  return n;
}

function uniqueList(value, path, ctx, item, { min = 0 } = {}) {
  const seen = new Set();
  return array(value, path, ctx, { min }).map((raw, i) => {
    const parsed = item(raw, `${path}[${i}]`, ctx);
    if (seen.has(parsed)) ctx.fail(`${path}[${i}]`, `duplicate ${JSON.stringify(parsed)}`);
    seen.add(parsed);
    return parsed;
  });
}

function revKey(value, path, ctx) {
  const key = nonEmpty(value, path, ctx);
  if (!ctx.revKeys.has(key)) ctx.fail(path, `unknown commit key ${JSON.stringify(key)}; use an authored commit key, merge-pr-<n>, or head`);
  return key;
}

function changeKey(value, path, ctx) {
  const key = nonEmpty(value, path, ctx);
  if (!ctx.changeKeys.has(key)) {
    ctx.fail(path, `${JSON.stringify(key)} is not a change: use pr#<n> for a merged pull request or the key of a commit pushed to main`);
  }
  return key;
}

function goldId(value, path, ctx, pattern = GOLD_ID) {
  const id = nonEmpty(value, path, ctx);
  if (!pattern.test(id)) ctx.fail(path, `id ${JSON.stringify(id)} must match ${pattern}`);
  if (ctx.goldIds.has(id)) ctx.fail(path, `duplicate id ${JSON.stringify(id)}, also at ${ctx.goldIds.get(id)}`);
  ctx.goldIds.set(id, path);
  return id;
}

function person(value, path, ctx) {
  const handle = nonEmpty(value, path, ctx);
  if (!Object.hasOwn(ctx.people, handle)) ctx.fail(path, `unknown handle ${JSON.stringify(handle)}`);
  if (ctx.people[handle].kind !== 'User') ctx.fail(path, `${handle} is a bot, not a person to ask`);
  return handle;
}

/** change is true when id is a change key, which gold names by its change id. */
function parseCovers(obj, path, ctx, id, change = false) {
  if (!Object.hasOwn(obj, 'covers')) return [];
  const covers = uniqueList(obj.covers, `${path}.covers`, ctx, (raw, at) => {
    const entry = nonEmpty(raw, at, ctx);
    if (!ctx.answerIds.has(entry)) ctx.fail(at, `unknown answer-key entry ${JSON.stringify(entry)}`);
    return entry;
  });
  for (const entry of covers) ctx.covers.push({ entry, id, change, path: `${path}.covers` });
  return covers;
}

function parseProofSpec(raw, path, ctx) {
  const verb = oneOf(raw.verb, `${path}.verb`, ctx, PROOF_VERBS);
  const spec = PROOF_SPECS[verb];
  const required = [...(spec.revs ?? []), ...(spec.paths ?? []), ...(spec.strings ?? [])];
  rejectUnknown(raw, path, ctx, ['verb', 'shows', ...required, ...(spec.optional ?? [])]);
  requireFields(raw, path, ctx, ['shows', ...required]);
  const proof = { verb, shows: nonEmpty(raw.shows, `${path}.shows`, ctx) };
  for (const key of spec.revs ?? []) proof[key] = revKey(raw[key], `${path}.${key}`, ctx);
  for (const key of spec.paths ?? []) proof[key] = filePath(raw[key], `${path}.${key}`, ctx);
  for (const key of spec.strings ?? []) proof[key] = nonEmpty(raw[key], `${path}.${key}`, ctx);
  if (verb === 'grep') {
    const flags = Object.hasOwn(raw, 'flags') ? uniqueList(raw.flags, `${path}.flags`, ctx, (f, at) => oneOf(f, at, ctx, ['i', 'E'])) : [];
    proof.flags = ['i', 'E'].filter((f) => flags.includes(f));
    proof.paths = Object.hasOwn(raw, 'paths') ? uniqueList(raw.paths, `${path}.paths`, ctx, (p, at) => filePath(p, at, ctx), { min: 1 }) : [];
  }
  if (verb === 'files') proof.from = Object.hasOwn(raw, 'from') ? revKey(raw.from, `${path}.from`, ctx) : null;
  if (verb === 'run') ctx.runProofs.push({ id: proof.id, path: `${path}.id` });
  return proof;
}

/** accepts: 'any', 'record' (a quote in a record object), or 'proof' (a check the generator runs). */
function parseSaid(raw, path, ctx, accepts) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['eng', 'plain', 'ev']);
  requireFields(obj, path, ctx, ['eng', 'plain', 'ev']);
  const text = { eng: prose(obj.eng, `${path}.eng`, ctx), plain: prose(obj.plain, `${path}.plain`, ctx) };
  const ev = object(obj.ev, `${path}.ev`, ctx);
  const isProof = Object.hasOwn(ev, 'verb');
  if (isProof && accepts === 'record') ctx.fail(`${path}.ev`, 'must be a record ref with a quote, not a proof');
  if (!isProof && accepts === 'proof') ctx.fail(`${path}.ev`, 'must be a proof the generator runs, not a record ref');
  return { ...text, ev: isProof ? { proof: parseProofSpec(ev, `${path}.ev`, ctx) } : { ref: ctx.ref(ev, `${path}.ev`) } };
}

function parsePoints(value, path, ctx, { min }) {
  const list = array(value, path, ctx, { min });
  if (list.length > MAX_POINTS) ctx.fail(path, `at most ${MAX_POINTS} points, got ${list.length}`);
  return list.map((said, i) => parseSaid(said, `${path}[${i}]`, ctx, 'any'));
}

function parseWhy(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['reason', 'notRecorded']);
  if (Object.keys(obj).length !== 1) ctx.fail(path, 'expected exactly one of reason or notRecorded');
  if (Object.hasOwn(obj, 'reason')) return { kind: 'recorded', reason: parseSaid(obj.reason, `${path}.reason`, ctx, 'record') };
  const at = `${path}.notRecorded`;
  const gap = object(obj.notRecorded, at, ctx);
  rejectUnknown(gap, at, ctx, ['ask', 'guess', 'truth', 'phrases']);
  requireFields(gap, at, ctx, ['ask']);
  const phrases = Object.hasOwn(gap, 'phrases') ? uniqueList(gap.phrases, `${at}.phrases`, ctx, (p, where) => nonEmpty(p, where, ctx), { min: 1 }) : [];
  phrases.forEach((phrase, i) => ctx.phrases.push({ phrase, path: `${at}.phrases[${i}]` }));
  const truth = Object.hasOwn(gap, 'truth') ? nonEmpty(gap.truth, `${at}.truth`, ctx) : null;
  if (truth) ctx.truths.push(truth);
  return {
    kind: 'not-recorded',
    ask: uniqueList(gap.ask, `${at}.ask`, ctx, person, { min: 1 }),
    guess: Object.hasOwn(gap, 'guess') ? parseText(gap.guess, `${at}.guess`, ctx) : null,
  };
}

function parseTopic(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const required = ['id', 'parent', 'name', 'core', 'files', 'start', 'docs', 'headline', 'example'];
  rejectUnknown(obj, path, ctx, [...required, 'words', 'covers']);
  requireFields(obj, path, ctx, required);
  const id = goldId(obj.id, `${path}.id`, ctx, TOPIC_ID);
  const paths = (key) => uniqueList(obj[key], `${path}.${key}`, ctx, (p, at) => filePath(p, at, ctx));
  const files = paths('files');
  const core = paths('core');
  core.forEach((file, i) => {
    if (!files.includes(file)) ctx.fail(`${path}.core[${i}]`, `${file} is not in files`);
  });
  const parent = obj.parent === null ? null : nonEmpty(obj.parent, `${path}.parent`, ctx);
  if (parent === null && files.length > 0) ctx.fail(`${path}.files`, 'the root topic lists no files; it covers the whole repo');
  if (parent !== null && core.length === 0) ctx.fail(`${path}.core`, 'a child topic needs core files to align on');
  const start = object(obj.start, `${path}.start`, ctx);
  rejectUnknown(start, `${path}.start`, ctx, ['path', 'quote', 'lines']);
  requireFields(start, `${path}.start`, ctx, ['path', 'quote', 'lines']);
  const headline = array(obj.headline, `${path}.headline`, ctx, { min: 1 }).map((said, i) => parseSaid(said, `${path}.headline[${i}]`, ctx, 'any'));
  for (const side of ['eng', 'plain']) {
    const n = headline.reduce((sum, said) => sum + words(said[side]), 0);
    if (n > MAX_HEADLINE_WORDS) ctx.fail(`${path}.headline`, `${side} headline is ${n} words, over ${MAX_HEADLINE_WORDS}`);
  }
  return {
    id,
    parent,
    name: parseText(obj.name, `${path}.name`, ctx),
    core,
    files,
    start: {
      path: filePath(start.path, `${path}.start.path`, ctx),
      quote: nonEmpty(start.quote, `${path}.start.quote`, ctx),
      lines: positive(start.lines, `${path}.start.lines`, ctx),
    },
    docs: paths('docs'),
    headline,
    example: obj.example === null ? null : parseSaid(obj.example, `${path}.example`, ctx, 'any'),
    words: Object.hasOwn(obj, 'words') ? uniqueList(obj.words, `${path}.words`, ctx, (w, at) => nonEmpty(w, at, ctx)) : [],
    covers: parseCovers(obj, path, ctx, id),
  };
}

function parseAnchor(raw, path, ctx) {
  if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'verb')) ctx.fail(path, 'an anchor is a record ref with a quote, never a proof');
  return ctx.ref(raw, path);
}

function parseFinding(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const required = ['id', 'severity', 'topics', 'anchors', 'name', 'says', 'why'];
  rejectUnknown(obj, path, ctx, [...required, 'covers']);
  requireFields(obj, path, ctx, required);
  const id = goldId(obj.id, `${path}.id`, ctx);
  return {
    id,
    severity: oneOf(obj.severity, `${path}.severity`, ctx, SEVERITIES),
    topics: uniqueList(obj.topics, `${path}.topics`, ctx, (t, at) => nonEmpty(t, at, ctx)),
    anchors: array(obj.anchors, `${path}.anchors`, ctx, { min: 1 }).map((a, i) => parseAnchor(a, `${path}.anchors[${i}]`, ctx)),
    name: parseText(obj.name, `${path}.name`, ctx),
    says: parsePoints(obj.says, `${path}.says`, ctx, { min: 1 }),
    why: parseWhy(obj.why, `${path}.why`, ctx),
    covers: parseCovers(obj, path, ctx, id),
  };
}

function parseRoutine(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['files', 'name', 'reason']);
  requireFields(obj, path, ctx, ['files', 'name', 'reason']);
  return {
    files: uniqueList(obj.files, `${path}.files`, ctx, (p, at) => filePath(p, at, ctx), { min: 1 }),
    name: parseText(obj.name, `${path}.name`, ctx),
    reason: parseSaid(obj.reason, `${path}.reason`, ctx, 'proof'),
  };
}

function parseLivesIn(raw, path, ctx) {
  const entries = Object.entries(object(raw, path, ctx)).map(([topic, ev]) => {
    const at = `${path}.${topic}`;
    const proof = object(ev, at, ctx);
    oneOf(proof.verb, `${at}.verb`, ctx, LIVES_IN_VERBS);
    const parsed = parseProofSpec(proof, at, ctx);
    if (parsed.verb === 'grep' && parsed.paths.length === 0) ctx.fail(`${at}.paths`, `name the ${topic} code files the grep reads`);
    return [topic, parsed];
  });
  return new Map(entries);
}

function parseChange(key, raw, path, ctx) {
  changeKey(key, path, ctx);
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['topics', 'livesIn', 'findings', 'routine', 'covers']);
  requireFields(obj, path, ctx, ['topics']);
  const list = (field, parse) => (Object.hasOwn(obj, field) ? array(obj[field], `${path}.${field}`, ctx).map((x, i) => parse(x, `${path}.${field}[${i}]`, ctx)) : []);
  return {
    key,
    path,
    topics: uniqueList(obj.topics, `${path}.topics`, ctx, (t, at) => nonEmpty(t, at, ctx)),
    livesIn: Object.hasOwn(obj, 'livesIn') ? parseLivesIn(obj.livesIn, `${path}.livesIn`, ctx) : new Map(),
    findings: list('findings', parseFinding),
    routine: list('routine', parseRoutine),
    covers: parseCovers(obj, path, ctx, key, true),
  };
}

function assertIntent(ref, path, ctx) {
  if (DENIAL.test(ref.quote)) {
    ctx.fail(`${path}.quote`, 'says "no behavior change", which shows no intent: this is a Behavior change finding with "Nobody wrote down why", not a decision');
  }
  return ref;
}

function parseDecision(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  if (Object.hasOwn(obj, 'who')) ctx.fail(`${path}.who`, 'unknown field; the decider is derived from the intent author');
  const required = ['id', 'what', 'topics', 'carriedBy', 'why'];
  rejectUnknown(obj, path, ctx, [...required, 'alsoIntent', 'replacedBy', 'covers']);
  requireFields(obj, path, ctx, required);
  const id = goldId(obj.id, `${path}.id`, ctx);
  const what = parseSaid(obj.what, `${path}.what`, ctx, 'record');
  assertIntent(what.ev.ref, `${path}.what.ev`, ctx);
  return {
    id,
    path,
    what,
    alsoIntent: Object.hasOwn(obj, 'alsoIntent')
      ? array(obj.alsoIntent, `${path}.alsoIntent`, ctx).map((r, i) => assertIntent(parseAnchor(r, `${path}.alsoIntent[${i}]`, ctx), `${path}.alsoIntent[${i}]`, ctx))
      : [],
    topics: uniqueList(obj.topics, `${path}.topics`, ctx, (t, at) => nonEmpty(t, at, ctx), { min: 1 }),
    carriedBy: obj.carriedBy === null ? null : changeKey(obj.carriedBy, `${path}.carriedBy`, ctx),
    replacedBy: Object.hasOwn(obj, 'replacedBy') ? nonEmpty(obj.replacedBy, `${path}.replacedBy`, ctx) : null,
    why: parseWhy(obj.why, `${path}.why`, ctx),
    covers: parseCovers(obj, path, ctx, id),
  };
}

function parseClaim(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const base = ['id', 'doc', 'quote', 'topic', 'verdict'];
  requireFields(obj, path, ctx, base);
  const verdict = oneOf(obj.verdict, `${path}.verdict`, ctx, Object.keys(VERDICT_FIELDS));
  const extra = VERDICT_FIELDS[verdict];
  rejectUnknown(obj, path, ctx, [...base, ...extra, 'covers']);
  requireFields(obj, path, ctx, extra);
  const id = goldId(obj.id, `${path}.id`, ctx);
  const claim = {
    id,
    doc: filePath(obj.doc, `${path}.doc`, ctx),
    quote: nonEmpty(obj.quote, `${path}.quote`, ctx),
    topic: nonEmpty(obj.topic, `${path}.topic`, ctx),
    verdict,
    covers: parseCovers(obj, path, ctx, id),
  };
  if (extra.includes('since')) claim.since = changeKey(obj.since, `${path}.since`, ctx);
  if (extra.includes('brokenBy')) claim.brokenBy = changeKey(obj.brokenBy, `${path}.brokenBy`, ctx);
  if (extra.includes('why')) claim.why = parseSaid(obj.why, `${path}.why`, ctx, 'any');
  return claim;
}

function parseUndone(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['changes', 'name', 'says', 'covers']);
  requireFields(obj, path, ctx, ['changes', 'name', 'says']);
  const changes = uniqueList(obj.changes, `${path}.changes`, ctx, changeKey, { min: 2 });
  const id = `undone:${changes[0]}`;
  return {
    id,
    changes,
    name: parseText(obj.name, `${path}.name`, ctx),
    says: parsePoints(obj.says, `${path}.says`, ctx, { min: 0 }),
    covers: parseCovers(obj, path, ctx, id),
  };
}

function parseRun(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['id', 'at', 'lang', 'source']);
  requireFields(obj, path, ctx, ['id', 'at', 'lang', 'source']);
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  if (!RUN_ID.test(id)) ctx.fail(`${path}.id`, `run id must match ${RUN_ID}`);
  const source = nonEmpty(obj.source, `${path}.source`, ctx);
  if (Buffer.byteLength(source) > MAX_RUN_SOURCE_BYTES) ctx.fail(`${path}.source`, `over ${MAX_RUN_SOURCE_BYTES} bytes`);
  return { id, at: revKey(obj.at, `${path}.at`, ctx), lang: oneOf(obj.lang, `${path}.lang`, ctx, Object.keys(RUN_LANGS)), source };
}

function day(value, path, ctx) {
  const s = nonEmpty(value, path, ctx);
  if (!DAY.test(s) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) ctx.fail(path, `expected a day like 2024-11-19, got ${JSON.stringify(s)}`);
  return s;
}

function parseScreen(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const kind = oneOf(obj.kind, `${path}.kind`, ctx, Object.keys(SCREEN_FIELDS));
  rejectUnknown(obj, path, ctx, [...SCREEN_FIELDS[kind].required, ...SCREEN_FIELDS[kind].optional]);
  requireFields(obj, path, ctx, SCREEN_FIELDS[kind].required);
  const topic = nonEmpty(obj.topic, `${path}.topic`, ctx);
  if (kind === 'page') return { kind, path, topic, status: parseText(obj.status, `${path}.status`, ctx) };
  const from = day(obj.from, `${path}.from`, ctx);
  const to = day(obj.to, `${path}.to`, ctx);
  if (from > to) ctx.fail(`${path}.to`, `${to} is before ${from}`);
  const counts = object(obj.counts, `${path}.counts`, ctx);
  rejectUnknown(counts, `${path}.counts`, ctx, COUNTED);
  const named = uniqueList(obj.named, `${path}.named`, ctx, (n, at) => nonEmpty(n, at, ctx));
  if (named.length > 3) ctx.fail(`${path}.named`, `the summary names at most 3 items, got ${named.length}`);
  const notes = Object.hasOwn(obj, 'notes') ? object(obj.notes, `${path}.notes`, ctx) : {};
  const routine = object(obj.routine, `${path}.routine`, ctx);
  rejectUnknown(routine, `${path}.routine`, ctx, ['count', 'lines']);
  requireFields(routine, `${path}.routine`, ctx, ['count', 'lines']);
  return {
    kind,
    path,
    topic,
    from,
    to,
    counts: Object.fromEntries(COUNTED.filter((k) => Object.hasOwn(counts, k)).map((k) => [k, nonNegative(counts[k], `${path}.counts.${k}`, ctx)]).filter(([, n]) => n > 0)),
    named,
    notes: Object.fromEntries(Object.keys(notes).sort().map((k) => [changeKey(k, `${path}.notes`, ctx), oneOf(notes[k], `${path}.notes[${JSON.stringify(k)}]`, ctx, NOTES)])),
    routine: { count: nonNegative(routine.count, `${path}.routine.count`, ctx), lines: nonNegative(routine.lines, `${path}.routine.lines`, ctx) },
  };
}

function linkViews(views, ctx) {
  const topics = new Map(views.topics.map((t) => [t.id, t]));
  const roots = views.topics.filter((t) => t.parent === null);
  if (roots.length !== 1) ctx.fail('views.topics', `expected exactly one root topic (parent null), found ${roots.length}`);
  const rootId = roots[0].id;
  const topic = (id, path) => {
    if (!topics.has(id)) ctx.fail(path, `unknown topic ${JSON.stringify(id)}`);
    return topics.get(id);
  };
  views.topics.forEach((t, i) => {
    const seen = new Set([t.id]);
    for (let up = t.parent; up !== null; up = topic(up, `views.topics[${i}].parent`).parent) {
      if (seen.has(up)) ctx.fail(`views.topics[${i}].parent`, `parent cycle through ${up}`);
      seen.add(up);
    }
  });
  const changes = new Map(views.changes.map((c) => [c.key, c]));
  for (const change of views.changes) {
    change.topics.forEach((t, k) => {
      if (topic(t, `${change.path}.topics[${k}]`).parent === null) ctx.fail(`${change.path}.topics[${k}]`, 'list child topics only; the root shows every change');
    });
    for (const t of change.livesIn.keys()) {
      if (!change.topics.includes(t)) ctx.fail(`${change.path}.livesIn.${t}`, `${t} is not one of the change's topics`);
    }
    change.findings.forEach((f, j) => f.topics.forEach((t, k) => {
      if (!change.topics.includes(t)) ctx.fail(`${change.path}.findings[${j}].topics[${k}]`, `${t} is not one of the change's topics`);
    }));
    if (change.findings.length > 0) {
      change.topics.forEach((t, k) => {
        if (!change.findings.some((f) => f.topics.includes(t)) && !views.decisions.some((d) => d.carriedBy === change.key && d.topics.includes(t))) {
          ctx.fail(`${change.path}.topics[${k}]`, `${t} holds none of the change's findings and no decision it carries, so that topic's timeline would not show the change`);
        }
      });
    }
    const owner = new Map();
    change.routine.forEach((part, j) => part.files.forEach((file, k) => {
      if (owner.has(file)) ctx.fail(`${change.path}.routine[${j}].files[${k}]`, `${file} is already in routine[${owner.get(file)}]`);
      owner.set(file, j);
    }));
  }
  const decisionIds = new Set(views.decisions.map((d) => d.id));
  for (const d of views.decisions) {
    d.topics.forEach((t, k) => topic(t, `${d.path}.topics[${k}]`));
    if (d.carriedBy !== null) {
      const carrier = changes.get(d.carriedBy);
      if (!carrier) ctx.fail(`${d.path}.carriedBy`, `${d.carriedBy} has no entry in views.changes, so its kind cannot be derived`);
      d.topics.forEach((t, k) => {
        if (t !== rootId && !carrier.topics.includes(t)) ctx.fail(`${d.path}.topics[${k}]`, `${d.carriedBy} is not in ${t}, so that topic's timeline would not show it`);
      });
    }
    if (d.replacedBy !== null && (!decisionIds.has(d.replacedBy) || d.replacedBy === d.id)) {
      ctx.fail(`${d.path}.replacedBy`, `${JSON.stringify(d.replacedBy)} is not another decision`);
    }
  }
  views.claims.forEach((c, i) => {
    if (!topic(c.topic, `views.claims[${i}].topic`).docs.includes(c.doc)) ctx.fail(`views.claims[${i}].doc`, `${c.doc} is not one of ${c.topic}'s docs`);
  });
  views.undone.forEach((u, i) => u.changes.forEach((key, k) => {
    if (!changes.has(key)) ctx.fail(`views.undone[${i}].changes[${k}]`, `${key} has no entry in views.changes`);
  }));
  const runIds = new Set();
  views.runs.forEach((run, i) => {
    if (runIds.has(run.id)) ctx.fail(`views.runs[${i}].id`, `duplicate run id ${run.id}`);
    runIds.add(run.id);
  });
  for (const proof of ctx.runProofs) if (!runIds.has(proof.id)) ctx.fail(proof.path, `no run in views.runs has id ${proof.id}`);
  const nameable = new Set([...ctx.goldIds.keys(), ...changes.keys(), ...views.undone.map((u) => u.id)]);
  for (const screen of views.screens) {
    topic(screen.topic, `${screen.path}.topic`);
    if (screen.kind !== 'timeline') continue;
    screen.named.forEach((n, k) => {
      if (!nameable.has(n)) ctx.fail(`${screen.path}.named[${k}]`, `${n} is not a finding, decision, change, or undone group in views`);
    });
  }
}

/**
 * ctx is parseSpec's context plus ref (the spec Ref parser), changeKeys (pr#<n> for merged pull requests and keys of
 * direct commits), revKeys (commit keys, merge-pr-<n>, head), and answerIds.
 */
export function parseViews(raw, specCtx) {
  const ctx = { ...specCtx, goldIds: new Map(), covers: [], phrases: [], truths: [], runProofs: [] };
  const obj = object(raw, 'views', ctx);
  const known = ['scope', 'topics', 'changes', 'decisions', 'claims', 'undone', 'runs', 'screens', 'uncovered'];
  rejectUnknown(obj, 'views', ctx, known);
  requireFields(obj, 'views', ctx, known.slice(0, -1));
  const list = (field, parse) => array(obj[field], `views.${field}`, ctx).map((x, i) => parse(x, `views.${field}[${i}]`, ctx));
  const views = {
    scope: oneOf(obj.scope, 'views.scope', ctx, SCOPES),
    topics: list('topics', parseTopic),
    changes: Object.entries(object(obj.changes, 'views.changes', ctx)).map(([key, c]) => parseChange(key, c, `views.changes[${JSON.stringify(key)}]`, ctx)),
    decisions: list('decisions', parseDecision),
    claims: list('claims', parseClaim),
    undone: list('undone', parseUndone),
    runs: list('runs', parseRun),
    screens: list('screens', parseScreen),
    uncovered: Object.hasOwn(obj, 'uncovered') ? list('uncovered', (u, path) => {
      const item = object(u, path, ctx);
      rejectUnknown(item, path, ctx, ['key', 'why']);
      requireFields(item, path, ctx, ['key', 'why']);
      if (!ctx.answerIds.has(item.key)) ctx.fail(`${path}.key`, `unknown answer-key entry ${JSON.stringify(item.key)}`);
      return { key: item.key, why: nonEmpty(item.why, `${path}.why`, ctx) };
    }) : [],
    covers: ctx.covers,
    phrases: ctx.phrases,
    truths: ctx.truths,
  };
  linkViews(views, ctx);
  return views;
}

function lines(out) {
  return out.split('\n').filter(Boolean);
}

function normalize(s) {
  return s.toLowerCase().replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '');
}

/** Spans in double quotes, outside code spans. Each must appear in the sentence's own source. */
function quotesIn(s) {
  return [...s.replace(/`[^`]*`/g, ' ').matchAll(/"([^"]{2,})"|\u201c([^\u201d]{2,})\u201d/g)].map((m) => m[1] ?? m[2]);
}

function indent(line) {
  return line.match(/^\s*/)[0].length;
}

function sourceKey(source) {
  return `${source.ref}\n${source.quote}`;
}

function resolveRecord(ref, path, ctx) {
  const hit = ctx.record.resolveRef(ref, path);
  const source = { kind: 'record', ref: hit.locator, quote: ref.quote };
  ctx.sources.set(sourceKey(source), { day: hit.day, author: hit.author, url: hit.url });
  return { source, text: ref.quote };
}

function resolveProof(spec, path, ctx) {
  const proof = PROOF_SPECS[spec.verb].wire(spec, ctx.rev7);
  const request = formatProof(proof);
  if (!ctx.outputs.has(request)) ctx.outputs.set(request, runProof(ctx.record.dir, proof, ctx.runs));
  const result = ctx.outputs.get(request);
  if (result.failed) ctx.fail(path, `proof "${request}" failed: ${result.failed}, ${result.detail}`);
  if (!result.text.includes(spec.shows)) {
    ctx.fail(`${path}.shows`, `proof "${request}" does not show ${JSON.stringify(spec.shows)}; it prints ${JSON.stringify(result.text)}`);
  }
  return { source: { kind: 'proof', proof: request }, text: result.text };
}

function resolveSaid(said, path, ctx) {
  const evidence = said.ev.ref ? resolveRecord(said.ev.ref, `${path}.ev`, ctx) : resolveProof(said.ev.proof, `${path}.ev`, ctx);
  for (const side of ['eng', 'plain']) {
    for (const quoted of quotesIn(said[side])) {
      if (!normalize(evidence.text).includes(normalize(quoted))) {
        ctx.fail(`${path}.${side}`, `quotes "${quoted}", which its source does not say; the source says ${JSON.stringify(evidence.text)}`);
      }
    }
  }
  return { eng: said.eng, plain: said.plain, source: evidence.source };
}

function resolveWhy(why, path, ctx) {
  if (why.kind === 'recorded') return { kind: 'recorded', reason: resolveSaid(why.reason, `${path}.reason`, ctx) };
  return { kind: 'not-recorded', ask: why.ask, guess: why.guess };
}

function headLines(file, path, ctx) {
  const body = showFile(ctx.record.dir, ctx.record.head, file);
  if (body === null) ctx.fail(path, `${file} is not at HEAD`);
  return body.replace(/\n$/, '').split('\n');
}

function resolveTopic(topic, path, ctx) {
  for (const key of ['files', 'docs']) {
    topic[key].forEach((file, i) => {
      if (!ctx.headFiles.has(file)) ctx.fail(`${path}.${key}[${i}]`, `${file} is not at HEAD`);
    });
  }
  const { start } = topic;
  const body = headLines(start.path, `${path}.start.path`, ctx);
  const at = body.flatMap((line, i) => (line === start.quote ? [i + 1] : []));
  if (at.length !== 1) ctx.fail(`${path}.start.quote`, `is ${at.length ? `${at.length} lines` : 'no whole line'} of ${start.path} at HEAD; it must be exactly one`);
  const from = at[0];
  const to = from + start.lines - 1;
  if (to > body.length) ctx.fail(`${path}.start.lines`, `lines ${from}-${to} run past the end of ${start.path} (${body.length} lines)`);
  const next = body[to];
  if (next !== undefined && next.trim() !== '' && indent(next) > indent(body[from - 1])) {
    ctx.fail(`${path}.start.lines`, `lines ${from}-${to} of ${start.path} stop mid-block: line ${to + 1} is ${JSON.stringify(next)}`);
  }
  if (topic.example) {
    const { ref, proof } = topic.example.ev;
    const backed = proof ? proof.verb === 'run' : ref.kind === 'file' && ctx.record.rev(ref.at) === ctx.record.head && isTestFile(ref.path);
    if (!backed) ctx.fail(`${path}.example.ev`, 'an example cites a test file at HEAD or a run; otherwise the topic shows none');
  }
  return {
    id: topic.id,
    parent: topic.parent,
    name: topic.name,
    files: topic.files,
    words: topic.words,
    start: { kind: 'record', ref: `${ctx.head7}:${start.path}#L${from}-L${to}`, quote: start.quote },
    docs: topic.docs,
    headline: topic.headline.map((said, i) => resolveSaid(said, `${path}.headline[${i}]`, ctx)),
    example: topic.example ? resolveSaid(topic.example, `${path}.example`, ctx) : null,
  };
}

function changeAuthors(facts, ctx) {
  const range = facts.before === EMPTY_TREE ? [facts.after] : [facts.after, `^${facts.before}`];
  const names = lines(git(ctx.record.dir, ['log', '--no-merges', '--format=%an', ...range]).stdout);
  return new Set([facts.author, ...names.map((n) => ctx.loginByName.get(n))].filter(Boolean));
}

/** Docs and tests describe a behavior, so only a topic's other files can show the topic implements it. */
function codeOf(topic) {
  return topic.files.filter((file) => !topic.docs.includes(file) && !isTestFile(file));
}

/**
 * A change placed on a topic whose files it never touched must show that the topic's code implements what it did:
 * a grep at HEAD over that code that finds it, or an introduced proof of a needle still in that code at HEAD.
 */
function checkLivesIn(proof, topic, path, ctx) {
  const code = codeOf(topic);
  const named = proof.verb === 'grep' ? proof.paths : [proof.path];
  named.forEach((file) => {
    if (!code.includes(file)) ctx.fail(path, `${file} is not ${topic.id} code; name one of ${code.join(', ')}`);
  });
  if (proof.verb === 'grep' && ctx.record.rev(proof.at) !== ctx.record.head) ctx.fail(`${path}.at`, `the grep reads ${proof.at}, but ${topic.id}'s code is the code at HEAD`);
  const { text } = resolveProof(proof, path, ctx);
  const missing = proof.verb === 'grep' ? text === '(no matches)' : text === '(never added)' || text.includes('no longer in');
  if (missing) ctx.fail(path, `the proof finds nothing in ${topic.id}'s code at HEAD: ${text}`);
}

function resolveChange(change, ctx, topics) {
  const { path } = change;
  const id = ctx.changeId(change.key, path);
  const facts = ctx.byId.get(id);
  change.topics.forEach((t, k) => {
    const topic = topics.get(t);
    const touched = topic.files.some((file) => facts.touched.has(file));
    const evidence = change.livesIn.get(t);
    if (touched && evidence) ctx.fail(`${path}.livesIn.${t}`, `${change.key} touches ${t}'s files, so it needs no proof that its behavior lives there`);
    if (!touched && !evidence) {
      ctx.fail(`${path}.topics[${k}]`, `${change.key} touches none of ${t}'s files; give livesIn.${t} a grep or introduced proof that ${t}'s code at HEAD implements what it did`);
    }
    if (evidence) checkLivesIn(evidence, topic, `${path}.livesIn.${t}`, ctx);
  });
  const authors = changeAuthors(facts, ctx);
  const findings = change.findings.map((f, j) => {
    const at = `${path}.findings[${j}]`;
    const anchors = f.anchors.map((ref, k) => resolveRecord(ref, `${at}.anchors[${k}]`, ctx).source);
    ctx.anchors[f.id] = anchors;
    if (f.why.kind === 'not-recorded') {
      f.why.ask.forEach((handle, k) => {
        if (!authors.has(handle)) ctx.fail(`${at}.why.notRecorded.ask[${k}]`, `${handle} wrote none of ${change.key}, so they are not the one to ask`);
      });
    }
    return {
      severity: f.severity,
      topics: f.topics,
      anchor: anchors[0],
      name: f.name,
      says: f.says.map((said, k) => resolveSaid(said, `${at}.says[${k}]`, ctx)),
      why: resolveWhy(f.why, `${at}.why`, ctx),
    };
  });
  const routine = change.routine.map((part, j) => {
    part.files.forEach((file, k) => {
      if (!facts.touched.has(file)) ctx.fail(`${path}.routine[${j}].files[${k}]`, `${file} is not a file ${change.key} touched`);
    });
    return { files: part.files, name: part.name, reason: resolveSaid(part.reason, `${path}.routine[${j}].reason`, ctx) };
  });
  return { id, topics: change.topics, findings, routine };
}

function resolveDecision(d, ctx) {
  const what = resolveSaid(d.what, `${d.path}.what`, ctx);
  const decider = ctx.sources.get(sourceKey(what.source)).author;
  if (!decider || ctx.record.people[decider]?.kind !== 'User') {
    ctx.fail(`${d.path}.what.ev`, `the intent was written by ${decider ?? 'nobody with a GitHub account'}, not a named person, so no decider can be derived`);
  }
  const also = d.alsoIntent.map((ref, k) => {
    const { source } = resolveRecord(ref, `${d.path}.alsoIntent[${k}]`, ctx);
    const author = ctx.sources.get(sourceKey(source)).author;
    if (author !== decider) {
      ctx.fail(`${d.path}.alsoIntent[${k}]`, `derives decider ${author}, but the intent derives ${decider}; an alternative anchor cannot change the name a page shows`);
    }
    return source;
  });
  ctx.anchors[d.id] = [what.source, ...also];
  if (d.why.kind === 'not-recorded' && !d.why.ask.includes(decider)) {
    ctx.fail(`${d.path}.why.notRecorded.ask`, `does not include the decider ${decider}`);
  }
  return {
    id: d.id,
    what,
    topics: d.topics,
    carriedBy: d.carriedBy === null ? null : ctx.changeId(d.carriedBy, `${d.path}.carriedBy`),
    replacedBy: d.replacedBy,
    why: resolveWhy(d.why, `${d.path}.why`, ctx),
  };
}

function resolveClaim(c, path, ctx, superseded) {
  if (superseded.has(c.doc)) {
    ctx.fail(`${path}.doc`, `${c.doc} is a superseded ADR; a sentence that survives only there is not a claim, its decision has replacedBy`);
  }
  if (!headLines(c.doc, `${path}.doc`, ctx).join('\n').includes(c.quote)) ctx.fail(`${path}.quote`, `not found verbatim in ${c.doc} at HEAD`);
  const claim = { sentence: { path: c.doc, quote: c.quote }, topic: c.topic, verdict: c.verdict };
  if (c.since) claim.since = ctx.changeId(c.since, `${path}.since`);
  if (c.brokenBy) claim.brokenBy = ctx.changeId(c.brokenBy, `${path}.brokenBy`);
  if (c.why) claim.why = resolveSaid(c.why, `${path}.why`, ctx);
  return claim;
}

function resolveUndone(group, path, ctx) {
  const ids = group.changes.map((key, k) => ctx.changeId(key, `${path}.changes[${k}]`));
  const order = ids.map((id) => ctx.position.get(id));
  if (order.some((n, k) => k > 0 && n <= order[k - 1])) ctx.fail(`${path}.changes`, 'list the members in the order they went live');
  const before = ctx.byId.get(ids[0]).before;
  const after = ctx.byId.get(ids.at(-1)).after;
  const net = runProof(ctx.record.dir, { verb: 'diff', from: before, to: after });
  if (net.failed || net.text !== '(no differences)') {
    ctx.fail(`${path}.changes`, `${group.changes.join(', ')} is not net zero: diff ${before.slice(0, 7)}..${after.slice(0, 7)} gives ${net.text ?? net.failed}`);
  }
  return { changes: ids, name: group.name, says: group.says.map((said, k) => resolveSaid(said, `${path}.says[${k}]`, ctx)) };
}

function countsOf(counts) {
  return Object.fromEntries(COUNTED.filter((k) => (counts[k] ?? 0) > 0).map((k) => [k, counts[k]]));
}

function checkScreen(screen, oracle, kernelFacts, ctx) {
  if (screen.kind === 'page') {
    const got = TEMPLATES.status(statusOf(screen.topic, oracle, kernelFacts));
    if (got.eng !== screen.status.eng || got.plain !== screen.status.plain) {
      ctx.fail(`${screen.path}.status`, `the kernel's status line is ${JSON.stringify(got)}, the spec hand-computed ${JSON.stringify(screen.status)}`);
    }
    return { kind: 'page', topic: screen.topic, status: screen.status };
  }
  const view = rangeOf(oracle, kernelFacts, { topic: screen.topic, from: screen.from, to: screen.to });
  const specName = (ref) => {
    const finding = /^(.+)\/(\d+)$/.exec(ref);
    if (finding) return ctx.findingIds[finding[1]][Number(finding[2])];
    if (ref.startsWith('undone:')) return `undone:${ctx.keyOf.get(ref.slice('undone:'.length))}`;
    return ctx.keyOf.get(ref) ?? ref;
  };
  const notes = {};
  for (const card of view.cards) {
    const change = card.kind === 'decision' ? card.carries[0] : card.kind === 'net' ? null : card.change;
    if (change && card.undoneNote) notes[ctx.keyOf.get(change)] = card.undoneNote;
  }
  const got = {
    counts: countsOf(view.counts),
    named: view.named.map((item) => specName(item.ref)),
    notes: Object.fromEntries(Object.keys(notes).sort().map((k) => [k, notes[k]])),
    routine: { count: view.routine.count, lines: view.routine.lines },
  };
  const want = { counts: screen.counts, named: screen.named, notes: screen.notes, routine: screen.routine };
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    ctx.fail(screen.path, `the kernel computes ${JSON.stringify(got)}, the spec hand-computed ${JSON.stringify(want)}`);
  }
  const idOf = (name) => (name.startsWith('undone:') ? `undone:${ctx.changeId(name.slice(7), screen.path)}` : ctx.changeKeys.has(name) ? ctx.changeId(name, screen.path) : name);
  return {
    kind: 'timeline',
    topic: screen.topic,
    from: screen.from,
    to: screen.to,
    counts: screen.counts,
    named: screen.named.map(idOf),
    notes: Object.fromEntries(Object.entries(screen.notes).map(([k, v]) => [ctx.changeId(k, screen.path), v])),
    routine: screen.routine,
  };
}

function grams(text, n) {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length <= n) return [tokens.join(' ')];
  return tokens.slice(0, tokens.length - n + 1).map((_, i) => tokens.slice(i, i + n).join(' '));
}

function canariesOf(views, record, goldIds) {
  const found = new Map();
  const add = (text, source) => found.set(`${source}\n${text}`, { text, source });
  for (const key of record.specKeys) add(key, 'spec-key');
  for (const phrase of [...views.phrases.map((p) => p.phrase), ...record.answerKey.flatMap((e) => e.notRecorded ?? [])]) add(phrase, 'not-recorded');
  for (const truth of [...views.truths, ...record.answerKey.flatMap((e) => (e.truth ? [e.truth] : []))]) {
    for (const gram of grams(truth, TRUTH_GRAM)) add(gram, 'truth-gram');
  }
  for (const id of goldIds) if (id.includes('-')) add(id, 'gold-id');
  add(`fixtures/specs/${record.slug}.mjs`, 'source-path');
  return [...found.keys()].sort().map((key) => found.get(key));
}

/** A decision tagged with the root alone is repo-wide, so its carrier must not sit inside one child topic's core files. */
function checkRootOnly(views, ctx) {
  const root = views.topics.find((t) => t.parent === null).id;
  const children = views.topics.filter((t) => t.parent !== null);
  for (const d of views.decisions) {
    if (d.carriedBy === null || d.topics.length !== 1 || d.topics[0] !== root) continue;
    const touched = [...ctx.byId.get(ctx.changeId(d.carriedBy, `${d.path}.carriedBy`)).touched.keys()];
    const home = children.find((t) => touched.length > 0 && touched.every((file) => t.core.includes(file)));
    if (home) ctx.fail(`${d.path}.topics`, `${d.carriedBy} touches only ${home.id}'s core files, so the decision belongs to ${home.id}, not to the root alone`);
  }
}

/** What may cover an entry that tests a gap or currency. Each takes exactly one such object and is never uncovered. */
const COVER_RULES = {
  gap: 'a decision or finding that says why was not recorded',
  currency: 'a claim or a superseded decision',
};

function ruleOf(entry) {
  if (entry.expect === 'gap') return 'gap';
  if (entry.job === 'currency') return 'currency';
  return null;
}

/**
 * Answer-key entry -> the gold ids that cover it, under the coverage contract (docs/design/scoring-harness.md, decision
 * 6). allowed maps each COVER_RULES kind to the gold ids that may cover such an entry. Full views cover every entry or
 * list it in uncovered with a reason.
 */
function coverageOf(views, record, ctx, allowed) {
  const goldIdOf = ({ id, change, path }) => {
    if (change) return ctx.changeId(id, path);
    return id.startsWith('undone:') ? `undone:${ctx.changeId(id.slice('undone:'.length), path)}` : id;
  };
  const covers = {};
  for (const item of views.covers) (covers[item.entry] ??= []).push({ id: goldIdOf(item), path: item.path });
  const uncovered = new Map(views.uncovered.map((u, i) => [u.key, `views.uncovered[${i}].key`]));
  for (const entry of record.answerKey) {
    const by = covers[entry.id] ?? [];
    const rule = ruleOf(entry);
    const listed = uncovered.get(entry.id);
    if (listed && by.length) ctx.fail(listed, `${entry.id} is covered by ${by.map((x) => x.id).join(', ')}, so it is not uncovered`);
    if (listed && rule) ctx.fail(listed, `${entry.id} is a ${rule} entry, so ${COVER_RULES[rule]} must cover it`);
    if (rule) {
      const wrong = by.find((x) => !allowed[rule].has(x.id));
      if (wrong) ctx.fail(wrong.path, `${entry.id} is a ${rule} entry, so only ${COVER_RULES[rule]} may cover it`);
      if (by.length > 1) ctx.fail(by[1].path, `${entry.id} is a ${rule} entry already covered by ${by[0].id}; exactly one object covers it`);
    }
    if (views.scope === 'full' && !listed && by.length === 0) {
      ctx.fail('views.uncovered', `${entry.id} is covered by no view object; give covers to the objects that answer it, or list it in uncovered with a reason`);
    }
  }
  return Object.fromEntries(Object.entries(covers).map(([entry, list]) => [entry, list.map((x) => x.id)]));
}

/**
 * The owner's floors count gap objects and currency claims across every repo, so they hold only once every repo's
 * views are full. A repo whose views are a slice, or that has none, keeps them waiting (docs/plans/v1-build.md, slice
 * 4). repos are { slug, scope: "slice" | "full" | null, gaps, claims }.
 */
export function floorsOf(repos) {
  const gaps = repos.reduce((n, r) => n + r.gaps, 0);
  const claims = repos.reduce((n, r) => n + r.claims, 0);
  const counts = `${gaps} gap objects (floor ${MIN_GAP_OBJECTS}), ${claims} currency claims (floor ${MIN_CURRENCY_CLAIMS})`;
  const partial = repos.filter((r) => r.scope !== 'full').map((r) => `${r.slug} ${r.scope === 'slice' ? 'is a slice' : 'has no views'}`);
  if (partial.length) return { status: 'waiting', line: `floors wait for full views in every repo (${partial.join(', ')}): ${counts}` };
  const met = gaps >= MIN_GAP_OBJECTS && claims >= MIN_CURRENCY_CLAIMS;
  return { status: met ? 'pass' : 'fail', line: `floors ${met ? 'met' : 'not met'}: ${counts}` };
}

/**
 * Resolves parsed views into { gold, canaries, summary }. gold is { version, slug, oracle, extras }: oracle is a contract
 * Snapshot whose ids are gold ids, and extras holds what gold knows beyond a snapshot (harness/gold.ts GoldExtras) plus
 * the hand-computed screens, each already checked against the kernel. Truth and never-recorded phrases go only to
 * canaries.
 */
export function goldOf(views, record) {
  const facts = factsOf(record.dir, record.github);
  const fail = (path, detail) => {
    throw new SpecError(record.slug, path, detail);
  };
  const byId = new Map(facts.changes.map((c) => [c.id, c]));
  const keyOf = new Map();
  const changeId = (key, path) => {
    const id = key.startsWith('pr#') ? key : record.rev(key).slice(0, 7);
    if (!byId.has(id)) fail(path, `${key} (${id}) is not a change git enumerates on main`);
    keyOf.set(id, key);
    return id;
  };
  const rev7 = (key) => record.rev(key).slice(0, 7);
  const ctx = {
    record,
    fail,
    byId,
    keyOf,
    changeId,
    changeKeys: new Set(views.changes.map((c) => c.key)),
    rev7,
    head7: record.head.slice(0, 7),
    position: new Map(facts.changes.map((c, i) => [c.id, i])),
    headFiles: new Set(lines(git(record.dir, ['ls-tree', '-r', '--name-only', record.head]).stdout)),
    loginByName: new Map(record.github.users.map((u) => [u.name, u.login])),
    runs: views.runs.map((run) => ({ id: run.id, rev: rev7(run.at), lang: run.lang, source: run.source })),
    sources: new Map(),
    outputs: new Map(),
    anchors: {},
    findingIds: {},
  };

  const topicsById = new Map(views.topics.map((t) => [t.id, t]));
  const topics = views.topics.map((t, i) => resolveTopic(t, `views.topics[${i}]`, ctx));
  const changes = views.changes
    .map((change) => {
      const resolved = resolveChange(change, ctx, topicsById);
      ctx.findingIds[resolved.id] = change.findings.map((f) => f.id);
      return resolved;
    })
    .sort((a, b) => ctx.position.get(a.id) - ctx.position.get(b.id));
  const decisions = views.decisions.map((d) => resolveDecision(d, ctx));
  const superseded = new Set(views.decisions.filter((d) => d.replacedBy !== null).flatMap((d) => [d.what.ev.ref, ...d.alsoIntent]).filter((ref) => ref.kind === 'file').map((ref) => ref.path));
  const claims = views.claims.map((c, i) => resolveClaim(c, `views.claims[${i}]`, ctx, superseded));
  const undone = views.undone.map((u, i) => resolveUndone(u, `views.undone[${i}]`, ctx));
  const oracle = { version: 1, head: record.head, topics, changes, decisions, claims, undone, runs: ctx.runs, usage: null };

  const kernelFacts = { ...facts, sourceOf: (source) => ctx.sources.get(sourceKey(source)) ?? null };
  for (const change of views.changes) {
    if (kindOf(changeId(change.key, change.path), oracle, kernelFacts) === 'unclassified') {
      fail(change.path, 'classifies as nothing: give it a finding, a decision it carries, or routine parts that cover every file it touched');
    }
  }
  if (views.scope === 'full') {
    const entered = new Set(changes.map((c) => c.id));
    const missing = facts.changes.filter((c) => !entered.has(c.id)).map((c) => c.id);
    if (missing.length) fail('views.changes', `full views classify every change git enumerates; missing ${missing.join(', ')}`);
  }
  checkRootOnly(views, ctx);
  const screens = views.screens.map((screen) => checkScreen(screen, oracle, kernelFacts, ctx));

  for (const { phrase, path } of views.phrases) {
    const where = record.foundIn(phrase);
    if (where) fail(path, `phrase ${JSON.stringify(phrase)} appears in ${where}, so it was recorded`);
  }
  const shown = JSON.stringify(oracle).toLowerCase();
  const phrases = [...views.phrases, ...record.answerKey.flatMap((e) => (e.notRecorded ?? []).map((phrase) => ({ phrase, path: `answerKey ${e.id}` })))];
  for (const { phrase, path } of phrases) {
    if (shown.includes(phrase.toLowerCase())) fail(path, `phrase ${JSON.stringify(phrase)} was never recorded, but gold shows it`);
  }

  const gapIds = new Set([...changes.flatMap((c) => c.findings.map((f, j) => (f.why.kind === 'not-recorded' ? ctx.findingIds[c.id][j] : null))), ...decisions.map((d) => (d.why.kind === 'not-recorded' ? d.id : null))].filter(Boolean));
  const covers = coverageOf(views, record, ctx, {
    gap: gapIds,
    currency: new Set([...views.claims.map((c) => c.id), ...views.decisions.filter((d) => d.replacedBy !== null).map((d) => d.id)]),
  });

  const goldIds = [...views.topics, ...views.changes.flatMap((c) => c.findings), ...views.decisions, ...views.claims].map((x) => x.id);
  const gold = {
    version: 1,
    slug: record.slug,
    oracle,
    extras: {
      core: Object.fromEntries(views.topics.map((t) => [t.id, t.core])),
      anchors: ctx.anchors,
      findings: Object.fromEntries(changes.map((c) => [c.id, ctx.findingIds[c.id]])),
      claims: views.claims.map((c) => c.id),
      undone: undone.map((u) => `undone:${u.changes[0]}`),
      covers: Object.fromEntries(Object.keys(covers).sort().map((k) => [k, covers[k]])),
      uncovered: views.uncovered,
      screens,
    },
  };
  return {
    gold,
    canaries: canariesOf(views, record, goldIds),
    summary: {
      scope: views.scope,
      changes: changes.length,
      of: facts.changes.length,
      gaps: gapIds.size,
      claims: claims.length,
      entries: { covered: Object.keys(covers).length, uncovered: views.uncovered.length, of: record.answerKey.length },
      screens: screens.length,
    },
  };
}
