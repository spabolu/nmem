import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cacheLife, cacheTag } from "next/cache";
import type { RepoIdentity } from "@/lib/kernel/contract";
import type { Built, Site } from "@/lib/kernel/site";
import { loadSite, readBuilt, rootId, siteOf } from "@/lib/kernel/site";
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

/** Canonical owner/name when a snapshot is already on disk, ignoring the typed case. */
export function builtSlug(owner: string, name: string): string | null {
  const want = `${owner}/${name}`.toLowerCase();
  const found = listWorkspaces().find(
    (row) =>
      row.built &&
      `${row.identity.owner}/${row.identity.name}`.toLowerCase() === want,
  );
  return found ? `${found.identity.owner}/${found.identity.name}` : null;
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

/** Size and mtime of the files a site reads, taken outside the cache so a rebuild makes a new key. */
function stampOf(workspace: Workspace): string {
  return ["snapshot.json", "site.json"]
    .map((name) => {
      try {
        const stat = fs.statSync(
          path.join(/*turbopackIgnore: true*/ workspace.dir, name),
        );
        return `${stat.mtimeMs}:${stat.size}`;
      } catch {
        return "missing";
      }
    })
    .join("/");
}

/** Errors do not keep their message through the cache in production, so a refusal comes back as data. */
async function builtFor(
  dir: string,
  _stamp: string,
): Promise<Built | { readonly refused: string }> {
  "use cache";
  cacheLife("max");
  cacheTag(`repo:${dir}`);
  try {
    return readBuilt(dir);
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
}

/** The parsed site for a built repo, cached until its files change. Null when no built workspace matches. */
export async function siteFor(
  owner: string,
  repo: string,
): Promise<Site | null> {
  const workspace = findWorkspace(owner, repo);
  if (!workspace) return null;
  const built = await builtFor(workspace.dir, stampOf(workspace));
  if ("refused" in built) throw new Error(built.refused);
  return siteOf(built);
}

const proxied = new Map<
  string,
  { readonly stamp: string; readonly site: Site }
>();

/** siteFor for the proxy, which runs outside a render, where "use cache" does not apply. */
export function siteForProxy(owner: string, repo: string): Site | null {
  const workspace = findWorkspace(owner, repo);
  if (!workspace) return null;
  const stamp = stampOf(workspace);
  const known = proxied.get(workspace.dir);
  if (known?.stamp === stamp) return known.site;
  const site = loadSite(workspace.dir);
  proxied.set(workspace.dir, { stamp, site });
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
export async function repoCards(): Promise<readonly RepoCard[]> {
  return Promise.all(
    listWorkspaces().map(async (workspace) => {
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
        const site = await siteFor(
          workspace.identity.owner,
          workspace.identity.name,
        );
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
    }),
  );
}
