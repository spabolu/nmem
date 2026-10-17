"use client";

import { useSyncExternalStore } from "react";
import { parseSlug } from "@/lib/slug";
import { RequestButton } from "./request-button";

const never = () => () => {};

/**
 * On a refused repo address, the repo the address names, with a Build button. The refusal page is static and served
 * at the address it refused, so the slug comes from the browser's location.
 */
export function BuildThis() {
  const path = useSyncExternalStore(
    never,
    () => location.pathname,
    () => "",
  );
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const slug = parts.length === 2 ? parseSlug(parts.join("/")) : null;
  if (!slug) return null;
  const repo = `${slug.owner}/${slug.name}`;
  return (
    <div
      className="mt-4 flex flex-col items-center gap-2"
      data-build-this={repo}
    >
      <p className="m-0">nmem has not built {repo}.</p>
      <RequestButton repo={repo} label={`Build ${repo}`} size="medium" />
    </div>
  );
}
