/**
 * Frozen copy of the lab's old site loader and query reader, reading built artifacts only: snapshot.json, the
 * site.json the lab bakes beside it (harness/bake.ts), and github.json. No git and no child processes.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ChangeId,
  LocalId,
  Login,
  RepoIdentity,
  Snapshot,
} from "./contract";
import { formatProof, parseProof, parseSnapshot } from "./contract";
import type {
  Audience,
  Hop,
  IsoDay,
  ItemId,
  RepoFacts,
  SourceFacts,
  TrackedItem,
  TrackedKind,
} from "./view";

export const SITE_SCHEMA_VERSION = 2;

const REBUILD = "rebuild this repo with nmem build-repo";

/** A snapshot the app refused. The message starts with the snapshot path. */
export class SnapshotRejected extends Error {
  readonly snapshotPath: string;
  constructor(snapshotPath: string, detail: string) {
    super(detail === "" ? snapshotPath : `${snapshotPath}\n${detail}`);
    this.name = "SnapshotRejected";
    this.snapshotPath = snapshotPath;
  }
}

type GithubUser = { readonly login: string; readonly name: string };
type GithubComment = {
  readonly id: number;
  readonly author: string;
  readonly body: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly at?: string;
  readonly editHistory?: readonly {
    readonly at: string;
    readonly body: string;
  }[];
  readonly replies?: readonly GithubComment[];
};
type GithubPull = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly openedAt: string;
  readonly mergedAt?: string | null;
  readonly mergeCommitSha?: string | null;
  readonly commits: readonly {
    readonly sha: string;
    readonly authorLogin: string | null;
    readonly authorName: string;
    readonly authoredAt: string;
  }[];
  readonly reviews: readonly {
    readonly id: number;
    readonly author: string;
    readonly at: string;
    readonly body: string;
    readonly threads: readonly {
      readonly comments: readonly GithubComment[];
    }[];
  }[];
  readonly comments: readonly GithubComment[];
};
type GithubIssue = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly openedAt: string;
  readonly comments: readonly GithubComment[];
};
type GithubDiscussion = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly at: string;
  readonly comments: readonly GithubComment[];
};
type GithubTag = {
  readonly name: string;
  readonly sha: string;
  readonly at: string;
  readonly by: string;
  readonly message: string;
};
type GithubRelease = {
  readonly tag: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly author: string;
};
export type Github = {
  readonly repo: { readonly owner: string; readonly name: string };
  readonly users: readonly GithubUser[];
  readonly pulls: readonly GithubPull[];
  readonly issues: readonly GithubIssue[];
  readonly discussions: readonly GithubDiscussion[];
  readonly tags: readonly GithubTag[];
  readonly releases: readonly GithubRelease[];
};

export type RecordObject = {
  readonly header: string;
  readonly revisions: readonly string[];
};
export type ProofOutput = { readonly header: string; readonly text: string };
export type ProofFailure = { readonly failed: string; readonly detail: string };

type Baked = {
  readonly schemaVersion: number;
  readonly snapshotSha256: string;
  readonly head: string;
  readonly born: string;
  readonly end: string;
  readonly changes: readonly {
    readonly id: string;
    readonly live: string;
    readonly before: string;
    readonly after: string;
    readonly touched: readonly (readonly [string, number])[];
    readonly author: string | null;
  }[];
  readonly people: readonly (readonly [string, string])[];
  readonly items: unknown;
  readonly sources: Readonly<
    Record<
      string,
      {
        readonly facts: SourceFacts | null;
        readonly object: RecordObject | null;
      }
    >
  >;
  readonly proofs: Readonly<Record<string, ProofOutput | ProofFailure>>;
};

export type Site = {
  readonly snapshot: Snapshot;
  readonly facts: RepoFacts;
  readonly identity: RepoIdentity;
  readonly github: Github;
  /** The record object a ref names, or null when the lab found none. */
  object(ref: string): RecordObject | null;
  sourceFacts(ref: string): SourceFacts | null;
  /** The baked output of a proof, or null when the string is not a proof the snapshot cites. */
  proof(raw: string): ProofOutput | ProofFailure | null;
};

function readBaked(file: string, snapshotPath: string, bytes: string): Baked {
  let baked: Baked;
  try {
    baked = JSON.parse(fs.readFileSync(file, "utf8")) as Baked;
  } catch (err) {
    throw new SnapshotRejected(
      snapshotPath,
      `${file} is missing or unreadable; ${REBUILD}. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (baked.schemaVersion !== SITE_SCHEMA_VERSION) {
    throw new SnapshotRejected(
      snapshotPath,
      `${file} is schema version ${String(baked.schemaVersion)}, and this app reads version ${SITE_SCHEMA_VERSION}; ${REBUILD}`,
    );
  }
  if (
    baked.snapshotSha256 !== createHash("sha256").update(bytes).digest("hex")
  ) {
    throw new SnapshotRejected(
      snapshotPath,
      `${file} was baked for a different snapshot; ${REBUILD}`,
    );
  }
  return baked;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const TRACKED_KINDS: readonly TrackedKind[] = [
  "symbol",
  "option",
  "config-key",
  "file",
];

function parseHop(raw: unknown, changes: ReadonlySet<string>): Hop | null {
  if (!isRecord(raw) || typeof raw.change !== "string") return null;
  if (!changes.has(raw.change)) return null;
  const change = raw.change as ChangeId;
  const { kind, matchedBy, from } = raw;
  if (kind === "introduced" || kind === "changed" || kind === "removed") {
    return matchedBy === "name" ? { change, kind, matchedBy } : null;
  }
  if (typeof from !== "string") return null;
  if (kind === "moved" && (matchedBy === "name" || matchedBy === "text")) {
    return { change, kind, from, matchedBy };
  }
  if (
    (kind === "renamed" || kind === "extracted-from") &&
    matchedBy === "text"
  ) {
    return { change, kind, from, matchedBy };
  }
  return null;
}

function parseItem(
  raw: unknown,
  changes: ReadonlySet<string>,
): TrackedItem | null {
  if (!isRecord(raw)) return null;
  const { id, kind, name, path: at, lines, formerNames, hops } = raw;
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (typeof at !== "string") return null;
  const tracked = TRACKED_KINDS.find((known) => known === kind);
  if (!tracked) return null;
  if (!Array.isArray(formerNames) || !Array.isArray(hops)) return null;
  if (!formerNames.every((one) => typeof one === "string")) return null;
  let span: TrackedItem["lines"] = null;
  if (lines !== null) {
    if (!isRecord(lines)) return null;
    const { start, end } = lines;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (Number(start) < 1 || Number(end) < Number(start)) return null;
    span = { start: Number(start), end: Number(end) };
  }
  const parsed = hops.map((hop) => parseHop(hop, changes));
  const [first, ...rest] = parsed;
  if (!first || rest.some((hop) => hop === null)) return null;
  return {
    id: id as ItemId,
    kind: tracked,
    name,
    path: at,
    lines: span,
    formerNames,
    hops: [first, ...rest.filter((hop) => hop !== null)],
  };
}

/** Item histories from site.json, checked at the boundary: known kinds, hops on known changes, one item per id. */
function parseItems(
  raw: unknown,
  changes: ReadonlySet<string>,
): readonly TrackedItem[] | string {
  if (!Array.isArray(raw)) return "items is not a list";
  const out: TrackedItem[] = [];
  const ids = new Set<string>();
  for (const [index, row] of raw.entries()) {
    const item = parseItem(row, changes);
    if (!item) return `items[${index}] is not an item history`;
    if (ids.has(item.id)) return `items[${index}] repeats the id ${item.id}`;
    ids.add(item.id);
    out.push(item);
  }
  return out;
}

/** What a built workspace holds, read and checked, as plain data so a cache can keep it. */
export type Built = {
  readonly snapshot: Snapshot;
  readonly baked: Baked;
  readonly items: readonly TrackedItem[];
  readonly github: Github;
};

/** Reads snapshot.json, site.json, and github.json from a built workspace. Throws SnapshotRejected on any defect. */
export function readBuilt(workspace: string): Built {
  const snapshotPath = path.resolve(workspace, "snapshot.json");
  let bytes: string;
  try {
    bytes = fs.readFileSync(snapshotPath, "utf8");
  } catch (err) {
    throw new SnapshotRejected(
      snapshotPath,
      err instanceof Error ? err.message : String(err),
    );
  }
  const baked = readBaked(
    path.join(workspace, "site.json"),
    snapshotPath,
    bytes,
  );
  const github = JSON.parse(
    fs.readFileSync(path.join(workspace, "github.json"), "utf8"),
  ) as Github;
  const changes = new Set(baked.changes.map((change) => change.id as ChangeId));
  const parsed = parseSnapshot(bytes, {
    repo: { owner: github.repo.owner, name: github.repo.name },
    head: baked.head,
    changes,
  });
  if (!parsed.ok) {
    throw new SnapshotRejected(
      snapshotPath,
      parsed.errors.map((error) => `${error.path}: ${error.what}`).join("\n"),
    );
  }
  const items = parseItems(baked.items, changes);
  if (typeof items === "string") {
    throw new SnapshotRejected(
      snapshotPath,
      `${path.join(workspace, "site.json")}: ${items}; ${REBUILD}`,
    );
  }
  return { snapshot: parsed.snapshot, baked, items, github };
}

export function siteOf({ snapshot, baked, items, github }: Built): Site {
  const sourceFacts = (ref: string): SourceFacts | null =>
    baked.sources[ref]?.facts ?? null;
  return {
    snapshot,
    facts: {
      head: baked.head,
      born: baked.born as IsoDay,
      end: baked.end as IsoDay,
      changes: baked.changes.map((change) => ({
        id: change.id as ChangeId,
        live: change.live as IsoDay,
        before: change.before,
        after: change.after,
        touched: new Map(change.touched),
        author: change.author as Login | null,
      })),
      people: new Map(baked.people as readonly (readonly [Login, string])[]),
      sourceOf: (source) => sourceFacts(source.ref),
      items,
    },
    identity: { owner: github.repo.owner, name: github.repo.name },
    github,
    object: (ref) => baked.sources[ref]?.object ?? null,
    sourceFacts,
    proof(raw) {
      const proof = parseProof(raw);
      return proof ? (baked.proofs[formatProof(proof)] ?? null) : null;
    },
  };
}

export function loadSite(workspace: string): Site {
  return siteOf(readBuilt(workspace));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type RequestQuery = {
  readonly audience: Audience;
  readonly all: boolean;
  readonly routine: boolean;
  readonly showUp: boolean;
  readonly showDown: boolean;
  readonly q: string;
  readonly from: IsoDay | null;
  readonly to: IsoDay | null;
  readonly topic: string | null;
  readonly ref: string;
  readonly quote: string;
  readonly proof: string;
};

export function readQuery(
  params: URLSearchParams,
): RequestQuery | { readonly error: string } {
  const rawAudience = params.get("audience");
  if (
    rawAudience !== null &&
    rawAudience !== "eng" &&
    rawAudience !== "plain"
  ) {
    return { error: `audience must be eng or plain, not ${rawAudience}` };
  }
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  if (fromRaw !== null && fromRaw !== "" && !DAY.test(fromRaw))
    return { error: `from is not a day: ${fromRaw}` };
  if (toRaw !== null && toRaw !== "" && !DAY.test(toRaw))
    return { error: `to is not a day: ${toRaw}` };
  const from = fromRaw && DAY.test(fromRaw) ? (fromRaw as IsoDay) : null;
  const to = toRaw && DAY.test(toRaw) ? (toRaw as IsoDay) : null;
  if (from && to && from > to)
    return { error: `from ${from} is after to ${to}` };
  const show = params.get("show");
  return {
    audience: rawAudience === "plain" ? "plain" : "eng",
    all: params.get("all") === "1",
    routine: params.get("routine") === "1",
    showUp: show === "up" || show === "both",
    showDown: show === "down" || show === "both",
    q: params.get("q") ?? "",
    from,
    to,
    topic: params.get("topic"),
    ref: params.get("ref") ?? "",
    quote: params.get("quote") ?? "",
    proof: params.get("proof") ?? "",
  };
}

export function rootId(site: Site): LocalId {
  const root = site.snapshot.topics.find((topic) => topic.parent === null);
  if (!root) throw new Error("the snapshot has no root topic");
  return root.id;
}
