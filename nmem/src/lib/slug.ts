/** Same rule as engine/add.ts parseSlug: owner/name, a github.com URL, or an SSH remote. */

const SLUG = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export type Slug = { readonly owner: string; readonly name: string };

export function parseSlug(input: string): Slug | null {
  const bare = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//, "")
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
