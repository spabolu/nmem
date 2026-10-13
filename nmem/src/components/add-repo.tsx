"use client";

import { FormControl, TextInput } from "@primer/react";
import { useId, useState } from "react";

const SLUG = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Same reading as engine/add.ts parseSlug: owner/name, a github.com URL, or an SSH remote. */
function slugOf(input: string): string | null {
  const bare = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  return SLUG.test(bare) ? bare : null;
}

export function AddRepo({ built }: { readonly built: readonly string[] }) {
  const [value, setValue] = useState("");
  const commandsId = useId();
  const slug = slugOf(value);
  const already = slug
    ? built.find((row) => row.toLowerCase() === slug.toLowerCase())
    : undefined;
  return (
    <div className="flex flex-col gap-3">
      <FormControl>
        <FormControl.Label>Add a repository</FormControl.Label>
        <FormControl.Caption>
          Paste owner/repo or a GitHub URL. nmem builds on this Mac from the
          command line.
        </FormControl.Caption>
        <TextInput
          block
          monospace
          placeholder="sindresorhus/p-limit"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={commandsId}
        />
        {value.trim() !== "" && !slug ? (
          <FormControl.Validation variant="error">
            That is not owner/repo or a github.com URL.
          </FormControl.Validation>
        ) : null}
      </FormControl>
      <div id={commandsId} aria-live="polite">
        {slug ? (
          <>
            <p className="m-0 mb-2 text-(color:--fgColor-muted)">
              {already
                ? `${already} is already built. Run these to read its latest history.`
                : "Run these from the nmem checkout, then reload this page."}
            </p>
            <pre className="m-0 rounded-(--borderRadius-medium) border border-(color:--borderColor-default) bg-(--bgColor-muted) p-3 font-(family-name:--fontStack-monospace) text-(length:--text-codeBlock-size) [overflow-wrap:anywhere] whitespace-pre-wrap">
              {`node engine/cli.ts add ${slug}\nnode engine/cli.ts build-repo ${slug}`}
            </pre>
          </>
        ) : null}
      </div>
    </div>
  );
}
