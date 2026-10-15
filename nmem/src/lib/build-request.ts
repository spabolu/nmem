"use server";

import { redirect } from "next/navigation";
import { nmemRoot, writeRequest } from "@/lib/jobs";
import { builtSlug } from "@/lib/repos";
import { parseSlug } from "@/lib/slug";

export async function requestBuild(
  _state: { readonly error: string } | null,
  formData: FormData,
): Promise<{ readonly error: string }> {
  const parsed = parseSlug(String(formData.get("repo") ?? ""));
  if (!parsed) return { error: "That is not owner/repo or a github.com URL." };
  if (formData.get("force") !== "1") {
    const built = builtSlug(parsed.owner, parsed.name);
    if (built) redirect(`/${built}?audience=eng`);
  }
  writeRequest(nmemRoot(), `${parsed.owner}/${parsed.name}`);
  redirect(`/${parsed.owner}/${parsed.name}?audience=eng`);
}
