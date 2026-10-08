// Reproduces every deterministic number in docs/design/scoring-harness.md from the real fixtures.
// Run from the repo root after `node fixtures/generate.mjs --check`:
//   node harness/examples/worked-example/probe.mjs [outDir]
// Judge-backed numbers (correctness, gap honesty, grounded, currency verdict, segmentation) are not computed here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'out'));
const answers = JSON.parse(fs.readFileSync(new URL('./answers.json', import.meta.url), 'utf8'));

const JARGON = [
  'sha', 'commit', 'commits', 'merge', 'merged', 'squash', 'branch', 'repo', 'repository',
  'pr', 'prs', 'pull request', 'issue', 'issues', 'ci', 'adr', 'adrs', 'schema', 'module',
  'sqlite', 'json', 'redis', 'middleware', 'nat', 'api',
];
const JARGON_WORDS = new RegExp(`\\b(${JARGON.map((w) => w.replace(' ', '\\s+')).join('|')})\\b`, 'gi');
const STRUCTURAL = {
  sha: /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g,
  path: /\b[\w.-]+\/[\w./-]+|\b[\w-]+\.(py|ts|go|js|mjs|json|md|yml|yaml|csv|toml|lock|html|txt|db)\b/g,
  flag: /(^|\s)--?[a-z][\w-]*/g,
  code: /\b\w+\(\)|\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z]\w*\b|`[^`]+`/g,
  ref: /#\d+/g,
};
const ANCHOR = /#\d+|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b|\b\d{4}-\d{2}-\d{2}\b|\b[\w.-]+\/[\w./-]*\w|--[a-z][\w-]*|`[^`]+`/g;
const LEAK_GRAM_SHARE = 0.25;

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9#.\-/ ]+/g, ' ').replace(/\.(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (needle) => new RegExp(`(^|[^\\w-])${escape(needle)}(?![\\w-])`, 'i');
function grams(s, n = 6) {
  const ws = norm(s).split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}

function gitIn(repoDir) {
  return (...args) => {
    try {
      return execFileSync('git', ['-C', repoDir, ...args], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }).toString();
    } catch {
      return null;
    }
  };
}

function loadRepo(slug) {
  const dir = path.join(outDir, slug);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const gh = read('github.json');
  const manifest = read('manifest.json');
  const key = read('answer-key.json').entries;
  const noise = read('noise.json');
  const git = gitIn(path.join(dir, 'repo'));
  const refNames = git('for-each-ref', '--format=%(refname)').trim().split('\n');
  const refShort = new Set(refNames.flatMap((r) => [r, r.replace(/^refs\/(heads|tags)\//, ''), ...r.split('/')]).map((s) => s.toLowerCase()));
  const specKeys = Object.entries(manifest)
    .filter(([k, sha]) => k.toLowerCase() !== 'head' && /^[0-9a-f]{40}$/.test(sha) && !refShort.has(k.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length);

  const comments = new Map();
  const addComment = (c, header) => comments.set(c.id, { header, revisions: c.editHistory ? c.editHistory.map((e) => e.body) : [c.body] });
  for (const p of gh.pulls) {
    for (const c of p.comments) addComment(c, `pr#${p.number}`);
    for (const r of p.reviews) {
      comments.set(r.id, { header: `review on pr#${p.number}`, revisions: [r.body] });
      for (const t of r.threads) for (const c of t.comments) addComment(c, `thread on pr#${p.number}`);
    }
  }
  for (const i of gh.issues) for (const c of i.comments) addComment(c, `issue#${i.number}`);
  for (const d of gh.discussions) for (const c of d.comments) {
    addComment(c, `discussion#${d.number}`);
    for (const r of c.replies ?? []) addComment(r, `discussion#${d.number}`);
  }

  const corpus = [
    JSON.stringify(gh),
    git('log', '--all', '-p', '--format=%B'),
    git('for-each-ref', 'refs/tags', '--format=%(contents)'),
    refNames.join('\n'),
  ].join('\n');
  return { slug, dir, gh, manifest, key, noise, git, refNames, specKeys, comments, corpus, corpusGrams: grams(corpus) };
}

function renderSpecKeys(repo, text) {
  let out = text;
  for (const [k, sha] of repo.specKeys) out = out.replace(new RegExp(`(^|[^\\w-])${escape(k)}(?![\\w-])`, 'g'), `$1${sha.slice(0, 7)}`);
  return out;
}

function parseRef(raw) {
  let m;
  if ((m = /^(comment|review):(\d+)( on (pr|issue|discussion)#\d+)?$/.exec(raw))) return { kind: 'comment', id: Number(m[2]) };
  if ((m = /^tag:(.+)$/.exec(raw))) return { kind: 'tag', name: m[1] };
  if ((m = /^(pr|issue|discussion)#(\d+)$/.exec(raw))) return { kind: m[1], number: Number(m[2]) };
  if ((m = /^[0-9a-f]{7,40}$/.exec(raw))) return { kind: 'commit', rev: raw };
  if ((m = /^([0-9a-f]{7,40}|[\w./-]+):(.+?)(#L(\d+)(-L(\d+))?)?$/.exec(raw))) return { kind: 'file', rev: m[1], path: m[2] };
  return null;
}

function resolve(repo, ref) {
  const byNumber = (list) => list.find((x) => x.number === ref.number);
  switch (ref.kind) {
    case 'commit': {
      const sha = repo.git('rev-parse', '--verify', '--quiet', `${ref.rev}^{commit}`);
      return sha ? { revisions: [repo.git('log', '-1', '--format=%B', sha.trim())] } : null;
    }
    case 'file': {
      const text = repo.git('show', `${ref.rev}:${ref.path}`);
      return text === null ? null : { revisions: [text] };
    }
    case 'pr': case 'issue': case 'discussion': {
      const list = ref.kind === 'pr' ? repo.gh.pulls : ref.kind === 'issue' ? repo.gh.issues : repo.gh.discussions;
      const o = byNumber(list);
      return o ? { revisions: [`${o.title}\n${o.body}`] } : null;
    }
    case 'comment': return repo.comments.get(ref.id) ?? null;
    case 'tag': {
      const t = repo.gh.tags.find((x) => x.name === ref.name);
      const r = repo.gh.releases.find((x) => x.tag === ref.name);
      return t || r ? { revisions: [[t?.message, r?.title, r?.body].filter(Boolean).join('\n')] } : null;
    }
  }
  return null;
}

function checkCitation(repo, c) {
  const parsed = parseRef(c.ref);
  if (!parsed) return { ...c, status: 'unreadable' };
  const object = resolve(repo, parsed);
  if (!object) return { ...c, status: 'no-object' };
  if (c.quote === undefined) return { ...c, status: 'resolves (no quote)', parsed };
  const found = object.revisions.some((r) => squash(r).includes(squash(c.quote)));
  return { ...c, status: found ? 'resolves' : 'quote-missing', parsed };
}

function keyObjects(entry) {
  const seen = new Map();
  for (const ev of entry.evidence) {
    const id = ev.kind === 'file' ? `file ${ev.path} :: ${ev.quote}` : ev.kind === 'commit' ? `commit ${ev.sha.slice(0, 7)}` : ev.locator.replace(/ on .*/, '');
    if (!seen.has(id)) seen.set(id, ev);
  }
  return [...seen.entries()];
}

function matchesKeyObject(repo, ev, checks) {
  return checks.some((c) => {
    if (!c.status.startsWith('resolves')) return false;
    const r = c.parsed;
    switch (ev.kind) {
      case 'commit': return r.kind === 'commit' && ev.sha.startsWith(repo.git('rev-parse', `${r.rev}^{commit}`).trim().slice(0, 40).slice(0, ev.sha.length));
      case 'file': {
        if (r.kind !== 'file' || r.path !== ev.path) return false;
        const text = repo.git('show', `${r.rev}:${r.path}`);
        return text !== null && squash(text).includes(squash(ev.quote));
      }
      case 'comment': return r.kind === 'comment' && r.id === ev.githubId;
      case 'tag': return r.kind === 'tag' && `tag:${r.name}` === ev.locator;
      default: return r.kind === ev.kind && r.number === ev.number;
    }
  });
}

function jargonHits(text) {
  const hits = [...(text.match(JARGON_WORDS) ?? [])].map((w) => `word:${w}`);
  for (const [name, re] of Object.entries(STRUCTURAL)) for (const m of text.match(re) ?? []) hits.push(`${name}:${m.trim()}`);
  return hits;
}

const sharedGramsCache = new Map();
function keyOnlyGrams(repo, entry) {
  if (!sharedGramsCache.has(repo.slug)) {
    const counts = new Map();
    for (const e of repo.key) {
      const own = new Set([...grams(renderSpecKeys(repo, e.answers.technical)), ...grams(renderSpecKeys(repo, e.answers.nonTechnical))]);
      for (const g of own) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    sharedGramsCache.set(repo.slug, new Set([...counts].filter(([, n]) => n > 1).map(([g]) => g)));
  }
  const shared = sharedGramsCache.get(repo.slug);
  const source = [renderSpecKeys(repo, entry.answers.technical), renderSpecKeys(repo, entry.answers.nonTechnical), entry.truth ?? ''];
  return new Set(source.flatMap((s) => [...grams(s)]).filter((g) => !repo.corpusGrams.has(g) && !shared.has(g)));
}

function canaries(repo, entry, rule) {
  const keys = rule === 'all-manifest-keys' ? Object.keys(repo.manifest) : repo.specKeys.map(([k]) => k);
  return [...keys.map((text) => ({ text, source: 'spec-key' })), ...(entry.notRecorded ?? []).map((text) => ({ text, source: 'not-recorded' })), { text: outDir, source: 'source-path' }];
}

const repos = new Map();
const repoOf = (slug) => {
  if (!repos.has(slug)) repos.set(slug, loadRepo(slug));
  return repos.get(slug);
};
const slugs = fs.readdirSync(outDir).filter((s) => !s.startsWith('_') && fs.existsSync(path.join(outDir, s, 'answer-key.json'))).sort();
const pct = (a, b) => `${a}/${b}`;

console.log('== census');
const groups = new Map();
let noiseSlice = 0;
let outsideGit = 0;
let locators = 0;
let locatorsResolved = 0;
const unresolvedLocators = [];
let plainFlagged = 0;
let technicalFlagged = 0;
let minKeyOnly = Infinity;
let minKeyOnlyAt = '';
let entriesTotal = 0;
for (const slug of slugs) {
  const repo = repoOf(slug);
  const noiseLocators = new Set(repo.noise.flatMap((n) => n.evidence.map((e) => e.locator)));
  for (const e of repo.key) {
    entriesTotal += 1;
    const g = `${e.job}/${e.expect ?? 'answer'}`;
    groups.set(g, (groups.get(g) ?? 0) + 1);
    if (e.facet === 'noise' || e.evidence.some((ev) => noiseLocators.has(ev.locator))) noiseSlice += 1;
    if (e.onlyOutsideGit?.length) outsideGit += 1;
    for (const ev of e.evidence) {
      locators += 1;
      const c = checkCitation(repo, { ref: ev.locator, quote: ev.quote });
      if (c.status === 'resolves') locatorsResolved += 1;
      else if (!(ev.kind === 'comment' && ev.revision !== undefined && c.status === 'resolves')) unresolvedLocators.push(`${slug}/${e.id} ${ev.locator} ${c.status}`);
    }
    if (jargonHits(renderSpecKeys(repo, e.answers.nonTechnical)).length) plainFlagged += 1;
    if (jargonHits(renderSpecKeys(repo, e.answers.technical)).length) technicalFlagged += 1;
    const k = keyOnlyGrams(repo, e).size;
    if (k < minKeyOnly) [minKeyOnly, minKeyOnlyAt] = [k, `${slug}/${e.id}`];
  }
}
console.log(`entries ${entriesTotal}; groups (job/expect, per audience): ${[...groups].sort().map(([g, n]) => `${g} ${n}`).join(', ')}`);
console.log(`slices: noise ${noiseSlice} (facet noise or cites planted noise), outside-git ${outsideGit}`);
console.log(`locator grammar: ${pct(locatorsResolved, locators)} key evidence locators parse, resolve, and contain their quote`);
for (const u of unresolvedLocators) console.log(`  not resolved: ${u}`);
console.log(`jargon detectors flag ${pct(plainFlagged, entriesTotal)} key plain answers and ${pct(technicalFlagged, entriesTotal)} key technical answers`);
console.log(`fewest key-only 6-grams for any entry (key answers plus truth): ${minKeyOnly} (${minKeyOnlyAt})`);
const detailSilence = slugs.flatMap((slug) => repoOf(slug).key.filter((e) => (e.expect ?? 'answer') === 'answer' && /does not say|doesn.t say|not recorded|no record/i.test(`${e.answers.technical} ${e.answers.nonTechnical}`)).map((e) => `${slug}/${e.id}`));
console.log(`answerable entries whose key answer says "does not say" or "not recorded" about a detail: ${detailSilence.length} (${detailSilence.join(', ')})`);

console.log('\n== canaries');
for (const slug of slugs) {
  const repo = repoOf(slug);
  const inCorpus = Object.keys(repo.manifest).filter((k) => wholeWord(k).test(repo.corpus));
  console.log(`${slug}: ${Object.keys(repo.manifest).length} manifest keys, ${repo.specKeys.length} used as canaries; manifest keys found in the public record: ${inCorpus.join(', ') || 'none'}`);
}

console.log('\n== clone scrub (wayfinder)');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  const ws = path.join(tmp, 'repo');
  execFileSync('git', ['clone', '--quiet', '--no-local', '--no-hardlinks', path.join(outDir, 'wayfinder', 'repo'), ws]);
  const git = gitIn(ws);
  const grepLeaks = () => {
    try {
      return execFileSync('grep', ['-rlIF', outDir, path.join(ws, '.git')]).toString().trim().split('\n').filter(Boolean).map((f) => path.relative(ws, f));
    } catch {
      return [];
    }
  };
  console.log(`fresh clone: files under .git naming the fixture path: ${grepLeaks().join(', ') || 'none'}; remote.origin.url = ${git('config', 'remote.origin.url').trim()}`);
  git('fetch', '--quiet', 'origin', '+refs/pull/*:refs/pull/*', '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*', '--update-head-ok');
  fs.rmSync(path.join(ws, '.git', 'logs'), { recursive: true, force: true });
  for (const f of ['ORIG_HEAD', 'FETCH_HEAD', 'COMMIT_EDITMSG']) fs.rmSync(path.join(ws, '.git', f), { force: true });
  for (const r of git('for-each-ref', '--format=%(refname)', 'refs/remotes').trim().split('\n').filter(Boolean)) git('update-ref', '-d', r);
  git('config', 'remote.origin.url', 'https://github.com/northwind-labs/wayfinder.git');
  git('pack-refs', '--all');
  const fixtureRefs = repoOf('wayfinder').refNames.length;
  const cloneRefs = git('for-each-ref', '--format=%(refname)').trim().split('\n').length;
  console.log(`after scrub: files naming the fixture path: ${grepLeaks().join(', ') || 'none'}; refs ${cloneRefs} (fixture has ${fixtureRefs})`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

for (const [itemKey, variants] of Object.entries(answers)) {
  const [slug, id] = itemKey.split('/');
  const repo = repoOf(slug);
  const entry = repo.key.find((e) => e.id === id);
  const keyText = { technical: renderSpecKeys(repo, entry.answers.technical), plain: renderSpecKeys(repo, entry.answers.nonTechnical) };
  const keyOnly = keyOnlyGrams(repo, entry);
  const anchors = [...new Set(keyText.technical.match(ANCHOR) ?? [])];
  const objects = keyObjects(entry);

  console.log(`\n== ${itemKey} (job ${entry.job}, expect ${entry.expect ?? 'answer'}, group ${entry.job}/${entry.expect ?? 'answer'})`);
  console.log(`key technical (${words(keyText.technical)} words): ${keyText.technical}`);
  console.log(`key plain (${words(keyText.plain)} words): ${keyText.plain}`);
  console.log(`key objects (${objects.length} distinct of ${entry.evidence.length} refs): ${objects.map(([k]) => k).join(' | ')}`);
  console.log(`anchors: ${anchors.join(', ')}; key-only 6-grams: ${keyOnly.size}; notRecorded: ${(entry.notRecorded ?? []).join(' | ') || 'none'}`);
  const noiseLocators = new Set(repo.noise.flatMap((n) => n.evidence.map((e) => e.locator)));
  console.log(`facet ${entry.facet}; noise slice ${entry.facet === 'noise' || entry.evidence.some((ev) => noiseLocators.has(ev.locator)) ? 'yes' : 'no'}; outside-git slice ${entry.onlyOutsideGit?.length ? 'yes' : 'no'}`);

  for (const [variant, byAudience] of Object.entries(variants)) {
    for (const audience of ['technical', 'plain']) {
      const statements = byAudience[audience];
      const text = statements.map((s) => s.text).join(' ');
      const checks = statements.flatMap((s) => s.cite ?? []).map((c) => checkCitation(repo, c));
      const resolved = checks.filter((c) => c.status.startsWith('resolves')).length;
      const w = words(text);
      const ratio = w / words(keyText[audience]);
      const concision = Math.min(1, 1.5 / ratio);
      const bases = statements.map((s) => s.basis).join(',');
      console.log(`-- ${variant} ${audience}: bases [${bases}], words ${w}, ratio ${ratio.toFixed(2)}, concision ${concision.toFixed(2)} (shown only if correctness passes), citations resolve ${pct(resolved, checks.length)}`);
      for (const c of checks) console.log(`     cite ${c.ref}${c.quote ? ` "${c.quote}"` : ''}: ${c.status}`);
      if (audience === 'technical') {
        const matched = objects.filter(([, ev]) => matchesKeyObject(repo, ev, checks)).map(([k]) => k);
        const present = anchors.filter((a) => text.includes(a));
        console.log(`     evidence recall ${pct(matched.length, objects.length)}: ${matched.join(' | ') || 'none'}`);
        console.log(`     anchors ${pct(present.length, anchors.length)}: ${present.join(', ') || 'none'}`);
      } else {
        console.log(`     jargon hits: ${jargonHits(text).join(', ') || 'none'}`);
      }
      const matchedGrams = [...grams(text)].filter((g) => keyOnly.has(g));
      const share = keyOnly.size ? matchedGrams.length / keyOnly.size : 0;
      const hit = (rule) => canaries(repo, entry, rule).filter((c) => wholeWord(c.text).test(text)).map((c) => `${c.source}:${c.text}`);
      console.log(`     leak: key-only grams ${pct(matchedGrams.length, keyOnly.size)} (share ${share.toFixed(2)}, trips at ${LEAK_GRAM_SHARE}); canaries ${hit('spec-keys').join(', ') || 'none'}; under the old rule (every manifest key) ${hit('all-manifest-keys').join(', ') || 'none'}`);
    }
  }
}
