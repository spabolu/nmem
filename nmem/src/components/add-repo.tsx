"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  RepoIcon,
  TerminalIcon,
} from "@primer/octicons-react";
import { Button, FormControl, TextInput } from "@primer/react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AppLink } from "@/components/links";
import { CHIP } from "@/components/styles";

const SLUG = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const EXAMPLE = "sindresorhus/p-limit";
const COMMAND_PANEL =
  "min-w-0 rounded-(--borderRadius-medium) border border-(color:--borderColor-default) bg-(--bgColor-muted) p-3";

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

export type InputState =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly raw: string }
  | { readonly kind: "built"; readonly slug: string }
  | { readonly kind: "waiting"; readonly slug: string }
  | { readonly kind: "unbuilt"; readonly slug: string };

function knownSlug(rows: readonly string[], slug: string): string | undefined {
  const want = slug.toLowerCase();
  return rows.find((row) => row.toLowerCase() === want);
}

/** Parse the field once. Built and waiting win over the typed casing so links match the workspace. */
export function resolveInput(
  value: string,
  built: readonly string[],
  waiting: readonly string[],
): InputState {
  if (value.trim() === "") return { kind: "empty" };
  const slug = slugOf(value);
  if (!slug) return { kind: "invalid", raw: value };
  const cached = knownSlug(built, slug);
  if (cached) return { kind: "built", slug: cached };
  const queued = knownSlug(waiting, slug);
  if (queued) return { kind: "waiting", slug: queued };
  return { kind: "unbuilt", slug };
}

type CommandPanel = {
  readonly lead: string;
  readonly commands: string;
};

function commandPanel(state: InputState): CommandPanel | null {
  switch (state.kind) {
    case "empty":
    case "invalid":
      return null;
    case "built":
      return {
        lead: `${state.slug} is already built. Open it above, or run these to read its latest history:`,
        commands: `node engine/cli.ts add ${state.slug}\nnode engine/cli.ts build-repo ${state.slug}`,
      };
    case "waiting":
      return {
        lead: `${state.slug} is added on this Mac. Run this from the nmem checkout to build its snapshot:`,
        commands: `node engine/cli.ts build-repo ${state.slug}`,
      };
    case "unbuilt":
      return {
        lead: "Run these from the nmem checkout, then reload this page:",
        commands: `node engine/cli.ts add ${state.slug}\nnode engine/cli.ts build-repo ${state.slug}`,
      };
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function examplesOf(built: readonly string[]): readonly string[] {
  return built.length > 0 ? built.slice(0, 3) : [EXAMPLE];
}

export function AddRepo({
  built,
  waiting = [],
}: {
  readonly built: readonly string[];
  readonly waiting?: readonly string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const state = resolveInput(value, built, waiting);
  const panel = commandPanel(state);
  const copied = panel !== null && copiedText === panel.commands;

  useEffect(() => {
    if (copiedText === null) return;
    const timer = window.setTimeout(() => setCopiedText(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedText]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "built") return;
    router.push(`/${state.slug}?audience=eng`);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
    } catch {
      setCopiedText(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <form
        className="flex w-full min-w-0 items-start gap-3 max-sm:flex-col"
        onSubmit={onSubmit}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3 max-sm:w-full">
          <FormControl className="min-w-0 w-full">
            <FormControl.Label visuallyHidden>Repository URL</FormControl.Label>
            <TextInput
              block
              monospace
              size="large"
              leadingVisual={RepoIcon}
              placeholder="https://github.com/owner/repo or owner/repo"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {state.kind === "invalid" ? (
              <FormControl.Validation variant="error">
                That is not owner/repo or a github.com URL.
              </FormControl.Validation>
            ) : null}
          </FormControl>
          {state.kind === "empty" ? (
            <ExamplePills
              examples={examplesOf(built)}
              built={built}
              onPick={setValue}
            />
          ) : null}
        </div>
        <Button
          variant="primary"
          size="large"
          type="submit"
          className="shrink-0 max-sm:w-full"
          trailingVisual={state.kind === "built" ? ArrowRightIcon : undefined}
        >
          {state.kind === "built" ? "Open repository" : "Analyze repository"}
        </Button>
      </form>
      {panel ? (
        <div className={COMMAND_PANEL}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="m-0 flex min-w-0 items-start gap-2 text-(color:--fgColor-muted)">
              <TerminalIcon className="mt-0.5 shrink-0 text-(color:--fgColor-default)" />
              <span aria-live="polite">{panel.lead}</span>
            </p>
            <Button
              type="button"
              size="small"
              className="shrink-0"
              leadingVisual={copied ? CheckIcon : CopyIcon}
              aria-label={copied ? "Copied" : "Copy commands"}
              onClick={() => void copy(panel.commands)}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="m-0 font-(family-name:--fontStack-monospace) text-(length:--text-codeBlock-size) [overflow-wrap:anywhere] whitespace-pre-wrap">
            {panel.commands}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function ExamplePills({
  examples,
  built,
  onPick,
}: {
  readonly examples: readonly string[];
  readonly built: readonly string[];
  readonly onPick: (slug: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        id="repo-examples"
        className="text-[12px] text-(color:--fgColor-muted)"
      >
        Examples
      </span>
      <ul
        aria-labelledby="repo-examples"
        className="m-0 flex min-w-0 list-none flex-wrap gap-2 p-0"
      >
        {examples.map((slug) => {
          const cached = knownSlug(built, slug);
          return (
            <li key={slug} className="min-w-0 max-w-full">
              {cached ? (
                <AppLink
                  href={`/${cached}?audience=eng`}
                  className={`${CHIP} max-w-full break-all`}
                >
                  {cached}
                </AppLink>
              ) : (
                <button
                  type="button"
                  className={`${CHIP} max-w-full cursor-pointer break-all`}
                  onClick={() => onPick(slug)}
                >
                  {slug}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
