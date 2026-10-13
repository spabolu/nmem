import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RepoIdentity } from "@/lib/kernel/contract";
import type { Site } from "@/lib/kernel/site";
import { loadSite, rootId } from "@/lib/kernel/site";
import { censusOf, TEMPLATES } from "@/lib/kernel/view";

/**
 * Where built repos live. `nmem add` mirrors each repo into <root>/<owner>/<repo>/ and `nmem build-repo` writes
 * snapshot.json beside it. NMEM_REPOS lists other roots with the same layout, separated like PATH.
 */
function repoRoots(): readonly string[] {
  const listed = process.env.NMEM_REPOS?.split(path.delimiter).filter(Boolean);
  if (listed && listed.length > 0)
    return listed.map((dir) => path.resolve(dir));
  return [path.join(os.userInfo().homedir, ".cache", "nmem", "repos")];
}

type Identity = RepoIdentity & { readonly description?: string };

/** A workspace on disk. `built` is false until build-repo has written its snapshot. */
type Workspace = {
  readonly identity: Identity;
  readonly dir: string;
  readonly snapshot: string;
  readonly built: boolean;
};

function subdirs(dir: string): readonly string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function readIdentity(dir: string): Identity | null {
  try {
    const github = JSON.parse(
      fs.readFileSync(path.join(dir, "github.json"), "utf8"),
    ) as { repo?: Identity };
    return github.repo ?? null;
  } catch {
    return null;
  }
}

function listWorkspaces(): readonly Workspace[] {
  const found: Workspace[] = [];
  for (const root of repoRoots()) {
    for (const ownerDir of subdirs(root)) {
      for (const dir of subdirs(ownerDir)) {
        const identity = readIdentity(dir);
        if (!identity) continue;
        const snapshot = path.join(dir, "snapshot.json");
        found.push({
          identity,
          dir,
          snapshot,
          built: fs.existsSync(snapshot),
        });
      }
    }
  }
  return found.sort((a, b) =>
    `${a.identity.owner}/${a.identity.name}`.localeCompare(
      `${b.identity.owner}/${b.identity.name}`,
    ),
  );
}

/** GitHub matches owner and repo names without regard to case, so the URL does too. */
function findWorkspace(owner: string, repo: string): Workspace | null {
  const want = `${owner}/${repo}`.toLowerCase();
  return (
    listWorkspaces().find(
      (row) =>
        row.built &&
        `${row.identity.owner}/${row.identity.name}`.toLowerCase() === want,
    ) ?? null
  );
}

const sites = new Map<
  string,
  { readonly mtimeMs: number; readonly site: Site }
>();

/** The parsed site for a built repo, reloaded when its snapshot changes. Null when no built workspace matches. */
export function siteFor(owner: string, repo: string): Site | null {
  const workspace = findWorkspace(owner, repo);
  if (!workspace) return null;
  const mtimeMs = fs.statSync(workspace.snapshot).mtimeMs;
  const cached = sites.get(workspace.snapshot);
  if (cached && cached.mtimeMs === mtimeMs) return cached.site;
  const site = loadSite(workspace.dir);
  sites.set(workspace.snapshot, { mtimeMs, site });
  return site;
}

type RepoCard = {
  readonly identity: Identity;
  readonly built: boolean;
  readonly census: { readonly eng: string; readonly plain: string } | null;
  readonly root: string | null;
  readonly error: string | null;
};

/** One row per workspace for the home page. A snapshot that fails to load still lists, with its error. */
export function repoCards(): readonly RepoCard[] {
  return listWorkspaces().map((workspace) => {
    if (!workspace.built) {
      return {
        identity: workspace.identity,
        built: false,
        census: null,
        root: null,
        error: null,
      };
    }
    try {
      const site = siteFor(workspace.identity.owner, workspace.identity.name);
      if (!site) throw new Error("snapshot vanished");
      return {
        identity: workspace.identity,
        built: true,
        census: TEMPLATES.census(censusOf(site.snapshot, site.facts)),
        root: rootId(site),
        error: null,
      };
    } catch (error) {
      return {
        identity: workspace.identity,
        built: true,
        census: null,
        root: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
