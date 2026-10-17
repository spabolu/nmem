/**
 * engine/add.ts parseSlug's rule (owner/name, a github.com URL, or an SSH remote), and also any github.com page inside
 * the repository, such as a file, a pull request, or a branch, since people paste what their address bar shows.
 */

/** GitHub owners are letters, digits, and inner hyphens, so "-refused/404" is never a repo. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;

export type Slug = { readonly owner: string; readonly name: string };

export function parseSlug(input: string): Slug | null {
  const trimmed = input.trim();
  const page =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+\/[^/?#]+)/.exec(trimmed);
  const bare = (page?.[1] ?? trimmed)
    .replace(/^git@github\.com:/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  if (!SLUG.test(bare)) return null;
  const [owner = "", name = ""] = bare.split("/");
  if (owner === "" || name === "") return null;
  return { owner, name };
}

export function jobKey(slug: Slug): string {
  return `${slug.owner.toLowerCase()}/${slug.name.toLowerCase()}`;
}
