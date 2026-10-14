/**
 * Scores one search box against the frozen lookup gold in harness/lookup/.
 * A hit is any gold target in the top results. A topic target needs that topic page.
 * A decision, change, or person target needs a result of that kind. While every result is
 * a topic, a decision or change also hits if a returned topic page shows it: a decision
 * is on the page when decisionsFor includes it, and a change is on the page when the topic
 * lists it or the topic is the root, whose history lists every change. Root can inflate
 * that fallback, so the report counts those hits apart.
 *
 *   node harness/lookup.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Snapshot } from './contract.ts';
import { loadGold } from './gold.ts';
import type { Slug } from './gold.ts';
import { factsOf, openFixture } from './record.ts';
import { decisionsFor, search } from './view.ts';
import type { RepoFacts } from './view.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const slugs = ['tally', 'wayfinder', 'seedling'] as const;
type Target =
  | { readonly type: 'topic'; readonly id: string }
  | { readonly type: 'decision'; readonly id: string }
  | { readonly type: 'change'; readonly id: string }
  | { readonly type: 'person'; readonly login: string };

type Query = {
  readonly id: string;
  readonly query: string;
  readonly kind: string;
  readonly targets: readonly Target[];
};

type Ranked = {
  readonly kind: 'topic' | 'decision' | 'change' | 'finding' | 'file' | 'person' | 'doc-claim';
  readonly id: string;
};

type Tally = { hit1: number; hit3: number; n: number; rootOnly: number };

function empty(): Tally {
  return { hit1: 0, hit3: 0, n: 0, rootOnly: 0 };
}

function add(into: Tally, hit1: boolean, hit3: boolean, rootOnly: boolean): void {
  into.n += 1;
  if (hit1) into.hit1 += 1;
  if (hit3) into.hit3 += 1;
  if (rootOnly) into.rootOnly += 1;
}

function rate(hit: number, n: number): string {
  if (n === 0) return 'n/a';
  return `${(hit / n).toFixed(2)} (${hit}/${n})`;
}

function line(label: string, row: Tally): string {
  return `${label}\thit@1 ${rate(row.hit1, row.n)}\thit@3 ${rate(row.hit3, row.n)}\troot-only ${row.rootOnly}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readTargets(raw: unknown, id: string): Target[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${id}: no targets`);
  return raw.map((item) => {
    if (!isRecord(item) || typeof item.type !== 'string') throw new Error(`${id}: bad target`);
    if (item.type === 'person') {
      if (typeof item.login !== 'string') throw new Error(`${id}: person target has no login`);
      return { type: 'person', login: item.login };
    }
    if (item.type !== 'topic' && item.type !== 'decision' && item.type !== 'change') throw new Error(`${id}: bad target type ${item.type}`);
    if (typeof item.id !== 'string') throw new Error(`${id}: target has no id`);
    return { type: item.type, id: item.id };
  });
}

function readGold(slug: string): Query[] {
  const gold = JSON.parse(fs.readFileSync(path.join(here, 'lookup', `${slug}.json`), 'utf8')) as { queries?: unknown };
  if (!Array.isArray(gold.queries)) throw new Error(`${slug}: queries missing`);
  return gold.queries.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.query !== 'string' || typeof item.kind !== 'string') {
      throw new Error(`${slug}: bad query`);
    }
    return { id: item.id, query: item.query, kind: item.kind, targets: readTargets(item.targets, item.id) };
  });
}

function rankedOf(raw: readonly unknown[]): Ranked[] {
  const kinds = new Set(['topic', 'decision', 'change', 'finding', 'file', 'person', 'doc-claim']);
  return raw.map((item, index) => {
    if (typeof item === 'string') return { kind: 'topic', id: item };
    if (!isRecord(item) || typeof item.kind !== 'string' || typeof item.id !== 'string' || !kinds.has(item.kind)) {
      throw new Error(`search result ${index} is not a topic id or a known hit`);
    }
    return { kind: item.kind as Ranked['kind'], id: item.id };
  });
}

function rootId(snapshot: Snapshot): string {
  const rootTopic = snapshot.topics.find((topic) => topic.parent === null);
  if (!rootTopic) throw new Error('snapshot has no root topic');
  return rootTopic.id;
}

function showsDecision(topic: string, id: string, snapshot: Snapshot, facts: RepoFacts): boolean {
  return decisionsFor(topic, snapshot, facts).some((decision) => decision.id === id);
}

function showsChange(topic: string, id: string, snapshot: Snapshot): boolean {
  if (topic === rootId(snapshot)) return true;
  return snapshot.changes.find((change) => change.id === id)?.topics.includes(topic) ?? false;
}

function targetHit(target: Target, top: readonly Ranked[], topicsOnly: boolean, snapshot: Snapshot, facts: RepoFacts): { hit: boolean; viaRoot: boolean } {
  if (target.type === 'topic') {
    return { hit: top.some((row) => row.kind === 'topic' && row.id === target.id), viaRoot: false };
  }
  if (target.type === 'person') {
    return { hit: top.some((row) => row.kind === 'person' && row.id === target.login), viaRoot: false };
  }
  const kind = target.type;
  if (top.some((row) => row.kind === kind && row.id === target.id)) return { hit: true, viaRoot: false };
  if (!topicsOnly) return { hit: false, viaRoot: false };
  const pages = top.filter((row) => row.kind === 'topic' && (kind === 'decision' ? showsDecision(row.id, target.id, snapshot, facts) : showsChange(row.id, target.id, snapshot)));
  if (pages.length === 0) return { hit: false, viaRoot: false };
  return { hit: true, viaRoot: pages.every((row) => row.id === rootId(snapshot)) };
}

function main(): void {
  const overall = empty();
  const byKind = new Map<string, Tally>();
  const misses: string[] = [];
  console.log('lookup gold. hit = any target in the top results.');
  for (const slug of slugs) {
    const fixture = path.join(root, 'out', slug);
    const snapshot = loadGold(path.join(root, 'out'), slug as Slug).oracle;
    const facts = factsOf(openFixture(fixture));
    const repo = empty();
    const repoKind = new Map<string, Tally>();
    for (const query of readGold(slug)) {
      const ranked = rankedOf(search(snapshot, facts, query.query));
      const topicsOnly = ranked.every((row) => row.kind === 'topic');
      const at = (k: number): { hit: boolean; viaRoot: boolean } => {
        const top = ranked.slice(0, k);
        const hits = query.targets.map((target) => targetHit(target, top, topicsOnly, snapshot, facts));
        const hit = hits.some((row) => row.hit);
        const viaRoot = hit && hits.filter((row) => row.hit).every((row) => row.viaRoot);
        return { hit, viaRoot };
      };
      const one = at(1);
      const three = at(3);
      add(repo, one.hit, three.hit, three.hit && three.viaRoot);
      add(overall, one.hit, three.hit, three.hit && three.viaRoot);
      const kind = repoKind.get(query.kind) ?? empty();
      add(kind, one.hit, three.hit, three.hit && three.viaRoot);
      repoKind.set(query.kind, kind);
      const allKind = byKind.get(query.kind) ?? empty();
      add(allKind, one.hit, three.hit, three.hit && three.viaRoot);
      byKind.set(query.kind, allKind);
      if (!three.hit) {
        const targets = query.targets.map((target) => target.type === 'person' ? `person:${target.login}` : `${target.type}:${target.id}`).join(',');
        const top = ranked.slice(0, 3).map((row) => `${row.kind}:${row.id}`).join(',') || '(none)';
        misses.push(`${slug}\t${query.id}\t${query.kind}\t${JSON.stringify(query.query)}\t${targets}\t${top}`);
      }
    }
    console.log(line(slug, repo));
    for (const [kind, row] of [...repoKind].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${line(kind, row)}`);
  }
  console.log(line('overall', overall));
  for (const [kind, row] of [...byKind].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${line(kind, row)}`);
  console.log(`misses ${misses.length}`);
  for (const miss of misses) console.log(miss);
}

main();
