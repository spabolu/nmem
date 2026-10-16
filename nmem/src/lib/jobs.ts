import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jobKey, parseSlug, type Slug } from "@/lib/slug";

export type Phase = "fetching" | "quick" | "building" | "baking";

export type BuildView =
  | {
      readonly kind: "request";
      readonly slug: string;
      readonly input: string;
      readonly requestedAt: string;
    }
  | {
      readonly kind: "queued";
      readonly slug: string;
      readonly requestedAt: string;
      readonly attempts: number;
    }
  | {
      readonly kind: "running";
      readonly slug: string;
      readonly requestedAt: string;
      readonly attempts: number;
      readonly phase: Phase;
      readonly startedAt: string;
      readonly progress: string;
    }
  | {
      readonly kind: "done";
      readonly slug: string;
      readonly requestedAt: string;
      readonly attempts: number;
      readonly finishedAt: string;
      readonly seconds: number;
      readonly repo: string;
      readonly summary: string;
    }
  | {
      readonly kind: "failed";
      readonly slug: string;
      readonly requestedAt: string;
      readonly attempts: number;
      readonly finishedAt: string;
      readonly phase: Phase;
      readonly reason: string;
      readonly retryable: boolean;
    }
  | { readonly kind: "unread"; readonly slug: string; readonly reason: string };

const PHASES: readonly Phase[] = ["fetching", "quick", "building", "baking"];

function homeRoot(): string {
  return path.join(os.userInfo().homedir, ".cache", "nmem");
}

/** Parent of the first NMEM_REPOS entry, so serve --root and the app share one jobs directory. */
export function nmemRoot(): string {
  const listed = process.env.NMEM_REPOS?.split(path.delimiter).filter(Boolean);
  const first = listed?.[0];
  if (first) return path.dirname(path.resolve(/*turbopackIgnore: true*/ first));
  return homeRoot();
}

export function workerCommand(root = nmemRoot()): string {
  if (path.resolve(/*turbopackIgnore: true*/ root) === homeRoot()) {
    return "node engine/cli.ts worker";
  }
  const shown = /\s/.test(root) ? JSON.stringify(root) : root;
  return `node engine/cli.ts worker --root ${shown}`;
}

function namesOk(owner: string, name: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(owner) && /^[A-Za-z0-9._-]+$/.test(name);
}

function filesOf(root: string, owner: string, name: string) {
  const slug = jobKey({ owner, name });
  const [dirName = "", base = ""] = slug.split("/");
  const dir = path.join(root, "jobs", dirName);
  return {
    slug,
    request: path.join(dir, `${base}.request.json`),
    job: path.join(dir, `${base}.json`),
    log: path.join(dir, `${base}.log`),
  };
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function workerAlive(root = nmemRoot()): boolean {
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        /*turbopackIgnore: true*/ path.join(root, "jobs", "worker.lock"),
        "utf8",
      ),
    ) as { pid?: unknown };
    return typeof raw.pid === "number" && pidAlive(raw.pid);
  } catch {
    return false;
  }
}

export function hasBuild(
  owner: string,
  name: string,
  root = nmemRoot(),
): boolean {
  if (!namesOk(owner, name)) return false;
  const files = filesOf(root, owner, name);
  return (
    fs.existsSync(/*turbopackIgnore: true*/ files.request) ||
    fs.existsSync(/*turbopackIgnore: true*/ files.job)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  return typeof value === "string" && value !== "" ? value : null;
}

function phaseOf(value: unknown): Phase | null {
  return PHASES.find((phase) => phase === value) ?? null;
}

function readJson(file: string): unknown | null {
  try {
    return JSON.parse(
      fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8"),
    ) as unknown;
  } catch {
    return null;
  }
}

const UNREAD = (slug: string): BuildView => ({
  kind: "unread",
  slug,
  reason: "nmem could not read this build record.",
});

function parseJob(raw: unknown, slug: string): BuildView {
  if (!isRecord(raw)) return UNREAD(slug);
  const requestedAt = text(raw, "requestedAt") ?? "";
  const attempts =
    typeof raw.attempts === "number" && Number.isInteger(raw.attempts)
      ? raw.attempts
      : 0;
  if (raw.state === "queued")
    return { kind: "queued", slug, requestedAt, attempts };
  if (raw.state === "running") {
    const phase = phaseOf(raw.phase);
    const startedAt = text(raw, "startedAt");
    if (!phase || !startedAt) return UNREAD(slug);
    return {
      kind: "running",
      slug,
      requestedAt,
      attempts,
      phase,
      startedAt,
      progress: text(raw, "progress") ?? "",
    };
  }
  if (raw.state === "done") {
    const finishedAt = text(raw, "finishedAt");
    const repo = text(raw, "repo");
    const summary = text(raw, "summary");
    if (
      !finishedAt ||
      !repo ||
      summary === null ||
      typeof raw.seconds !== "number"
    )
      return UNREAD(slug);
    return {
      kind: "done",
      slug,
      requestedAt,
      attempts,
      finishedAt,
      seconds: raw.seconds,
      repo,
      summary,
    };
  }
  if (raw.state === "failed") {
    const phase = phaseOf(raw.phase);
    const finishedAt = text(raw, "finishedAt");
    const reason = text(raw, "reason");
    if (!phase || !finishedAt || !reason || typeof raw.retryable !== "boolean")
      return UNREAD(slug);
    return {
      kind: "failed",
      slug,
      requestedAt,
      attempts,
      finishedAt,
      phase,
      reason,
      retryable: raw.retryable,
    };
  }
  return UNREAD(slug);
}

function parseRequest(raw: unknown, slug: string): BuildView | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const input = text(raw, "input");
  const requestedAt = text(raw, "requestedAt");
  if (!input || !requestedAt) return null;
  return { kind: "request", slug, input, requestedAt };
}

export function buildView(
  owner: string,
  name: string,
  root = nmemRoot(),
): BuildView | null {
  if (!namesOk(owner, name)) return null;
  const files = filesOf(root, owner, name);
  const stored = fs.existsSync(/*turbopackIgnore: true*/ files.job)
    ? parseJob(readJson(files.job), files.slug)
    : null;
  if (stored && stored.kind !== "done") return stored;
  if (fs.existsSync(/*turbopackIgnore: true*/ files.request)) {
    const asked = parseRequest(readJson(files.request), files.slug);
    if (asked) return asked;
    if (!stored) return UNREAD(files.slug);
  }
  return stored;
}

export function listBuilds(root = nmemRoot()): readonly BuildView[] {
  const dir = path.join(root, "jobs");
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  const keys = new Set<string>();
  for (const owner of fs.readdirSync(/*turbopackIgnore: true*/ dir, {
    withFileTypes: true,
  })) {
    if (!owner.isDirectory()) continue;
    const ownerDir = path.join(dir, owner.name);
    for (const name of fs.readdirSync(/*turbopackIgnore: true*/ ownerDir)) {
      if (name.endsWith(".request.json")) {
        keys.add(`${owner.name}/${name.slice(0, -".request.json".length)}`);
      } else if (name.endsWith(".json")) {
        keys.add(`${owner.name}/${name.slice(0, -".json".length)}`);
      }
    }
  }
  return [...keys].sort().flatMap((key) => {
    const [owner = "", name = ""] = key.split("/");
    const view = buildView(owner, name, root);
    return view ? [view] : [];
  });
}

export function logTail(
  owner: string,
  name: string,
  lines = 8,
  root = nmemRoot(),
): readonly string[] {
  if (!namesOk(owner, name)) return [];
  try {
    return fs
      .readFileSync(
        /*turbopackIgnore: true*/ filesOf(root, owner, name).log,
        "utf8",
      )
      .split("\n")
      .filter((line) => line !== "")
      .slice(-lines);
  } catch {
    return [];
  }
}

export function writeRequest(
  root: string,
  input: string,
  requestedAt = new Date().toISOString(),
): { readonly slug: string; readonly wrote: boolean } {
  const parsed: Slug | null = parseSlug(input);
  if (!parsed) throw new Error("That is not owner/repo or a github.com URL.");
  const files = filesOf(root, parsed.owner, parsed.name);
  const body = `${JSON.stringify({ version: 1, input: `${parsed.owner}/${parsed.name}`, requestedAt })}\n`;
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(files.request), {
    recursive: true,
  });
  const temp = `${files.request}.${process.pid}.tmp`;
  fs.writeFileSync(/*turbopackIgnore: true*/ temp, body);
  try {
    fs.linkSync(/*turbopackIgnore: true*/ temp, files.request);
    return { slug: files.slug, wrote: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { slug: files.slug, wrote: false };
    }
    throw error;
  } finally {
    fs.rmSync(/*turbopackIgnore: true*/ temp, { force: true });
  }
}
