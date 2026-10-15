/**
 * The product app (nmem/) renders from a frozen copy of this lab's contract, view kernel, and proof grammar, fed by the
 * site.json harness/bake.ts writes instead of git. This proves the copy cannot drift: every gold snapshot, parsed and
 * rendered both ways, gives byte-identical pages and timelines in both audiences.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bakeSite } from './bake.ts';
import { formatProof, parseProof, parseSnapshot } from './contract.ts';
import type { Snapshot } from './contract.ts';
import { loadGold } from './gold.ts';
import type { Slug } from './gold.ts';
import { factsOf, openFixture } from './record.ts';
import { itemPageOf, renderPage, renderTimeline, screensOf, search, timelineOf } from './view.ts';
import type { Range, RepoFacts } from './view.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kernelDir = path.join(root, 'nmem', 'src', 'lib', 'kernel');

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(`file://${kernelDir}/`) && specifier.startsWith('./') && !path.extname(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

type KernelSite = { readonly snapshot: Snapshot; readonly facts: RepoFacts; sourceFacts(ref: string): unknown; proof(raw: string): unknown };
const kernel = (await import(path.join(kernelDir, 'site.ts'))) as { loadSite(dir: string): KernelSite };
const kernelView = (await import(path.join(kernelDir, 'view.ts'))) as typeof import('./view.ts');
const kernelProof = (await import(path.join(kernelDir, 'proof.ts'))) as { parseProof(raw: string): unknown; formatProof(proof: unknown): string };

function proofsIn(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) for (const item of value) proofsIn(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'proof' && typeof item === 'string') out.add(item);
      proofsIn(item, out);
    }
  }
  return out;
}

for (const slug of ['tally', 'wayfinder', 'seedling'] as Slug[]) {
  test(`${slug}: the app kernel renders gold exactly as the lab kernel does`, async () => {
    const fixture = path.join(root, 'out', slug);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nmem-kernel-${slug}-`));
    try {
      for (const entry of ['repo', 'github.json']) fs.symlinkSync(path.join(fixture, entry), path.join(dir, entry));
      const oracle = loadGold(path.join(root, 'out'), slug).oracle;
      const bytes = JSON.stringify(oracle);
      fs.writeFileSync(path.join(dir, 'snapshot.json'), bytes);
      await bakeSite(dir, path.join(dir, 'snapshot.json'));

      const record = openFixture(fixture);
      const facts = factsOf(record);
      const lab = parseSnapshot(bytes, { repo: record.workspace.identity, head: facts.head, changes: new Set(facts.changes.map((c) => c.id)) });
      assert.ok(lab.ok, 'lab parses gold');
      const site = kernel.loadSite(dir);
      assert.deepEqual(site.snapshot, lab.snapshot, 'both parsers read the same snapshot');
      assert.deepEqual(site.facts.items, facts.items, 'site.json carries the item histories the lab derives');
      assert.ok(facts.items.length > 0, 'items were derived');

      const screens = screensOf(lab.snapshot, facts);
      assert.deepEqual(kernelView.screensOf(site.snapshot, site.facts), screens, 'same screens');
      let rendered = 0;
      for (const screen of screens) {
        for (const audience of ['eng', 'plain'] as const) {
          const want: string = screen.kind === 'page'
            ? renderPage(lab.snapshot, facts, screen.topic, audience)
            : renderTimeline(lab.snapshot, facts, screen.range, audience);
          const got: string = screen.kind === 'page'
            ? kernelView.renderPage(site.snapshot, site.facts, screen.topic, audience)
            : kernelView.renderTimeline(site.snapshot, site.facts, screen.range, audience);
          assert.equal(got, want, `${slug} ${screen.kind} ${screen.kind === 'page' ? screen.topic : screen.preset} ${audience}`);
          rendered += 1;
        }
      }
      assert.ok(rendered >= 4, `rendered ${rendered} screens`);
      for (const item of facts.items) {
        assert.deepEqual(kernelView.itemPageOf(site.snapshot, site.facts, item.id), itemPageOf(lab.snapshot, facts, item.id), `${slug} item ${item.id}`);
        const life: Range = { topic: lab.snapshot.topics.find((topic) => topic.parent === null)?.id ?? '', from: facts.born, to: facts.end };
        assert.deepEqual(kernelView.timelineOf(site.snapshot, site.facts, life, item.id), timelineOf(lab.snapshot, facts, life, item.id), `${slug} timeline of ${item.id}`);
      }
      const gold = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'lookup', `${slug}.json`), 'utf8')) as { queries: { query: string }[] };
      for (const query of [...gold.queries.map((row) => row.query), ...facts.items.slice(0, 20).map((item) => item.name)]) {
        assert.deepEqual(kernelView.search(site.snapshot, site.facts, query), search(lab.snapshot, facts, query), `${slug} search "${query}"`);
      }

      for (const raw of proofsIn(oracle, new Set())) {
        const want = parseProof(raw);
        assert.deepEqual(kernelProof.parseProof(raw), want, `proof grammar parses ${raw}`);
        if (want) assert.equal(kernelProof.formatProof(want), formatProof(want), `proof grammar formats ${raw}`);
        assert.notEqual(site.proof(raw), null, `site.json holds output for ${raw}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('restyle proofs round-trip real-repo paths in the lab and the app', () => {
  const cases: [string, string][] = [
    ['lettericon/testdata/ф-32-dfdfdf.png', 'restyle 3d3aee3..0ec875e:lettericon/testdata/ф-32-dfdfdf.png'],
    ['docs/My Guide.md', 'restyle 3d3aee3..0ec875e: "docs/My Guide.md"'],
    ['say "hi".txt', 'restyle 3d3aee3..0ec875e: "say \\"hi\\".txt"'],
  ];
  for (const [file, raw] of cases) {
    const proof = parseProof(raw);
    assert.deepEqual(proof, { verb: 'restyle', from: '3d3aee3', to: '0ec875e', path: file });
    if (proof === null) continue;
    assert.equal(formatProof(proof), raw);
    assert.equal(kernelProof.formatProof(proof), raw);
    assert.deepEqual(kernelProof.parseProof(raw), proof);
  }
});
