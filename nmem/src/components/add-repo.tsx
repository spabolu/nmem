"use client";

import { ArrowRightIcon, RepoIcon } from "@primer/octicons-react";
import { Button, FormControl, TextInput } from "@primer/react";
import { useActionState, useState } from "react";
import { AppLink } from "@/components/links";
import { CHIP } from "@/components/styles";
import { requestBuild } from "@/lib/build-request";
import { parseSlug } from "@/lib/slug";

const EXAMPLE = "sindresorhus/p-limit";

export type InputState =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly raw: string }
  | { readonly kind: "built"; readonly slug: string }
  | { readonly kind: "fresh"; readonly slug: string };

function knownSlug(rows: readonly string[], slug: string): string | undefined {
  const want = slug.toLowerCase();
  return rows.find((row) => row.toLowerCase() === want);
}

export function resolveInput(
  value: string,
  built: readonly string[],
): InputState {
  if (value.trim() === "") return { kind: "empty" };
  const parsed = parseSlug(value);
  if (!parsed) return { kind: "invalid", raw: value };
  const slug = `${parsed.owner}/${parsed.name}`;
  const cached = knownSlug(built, slug);
  if (cached) return { kind: "built", slug: cached };
  return { kind: "fresh", slug };
}

/** Three built repos to try, or once the person types, the built repos whose name holds what they typed. */
function examplesOf(
  built: readonly string[],
  typed: string,
): readonly string[] {
  const want = typed.trim().toLowerCase();
  if (want === "") return built.length > 0 ? built.slice(0, 3) : [EXAMPLE];
  return built.filter((slug) => slug.toLowerCase().includes(want)).slice(0, 5);
}

export function AddRepo({ built }: { readonly built: readonly string[] }) {
  const [value, setValue] = useState("");
  const [left, setLeft] = useState(false);
  const [state, action, pending] = useActionState(requestBuild, null);
  const input = resolveInput(value, built);
  const blocked = input.kind === "empty" || input.kind === "invalid" || pending;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <form
        action={action}
        className="flex w-full min-w-0 items-start gap-3 max-sm:flex-col"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3 max-sm:w-full">
          <FormControl className="min-w-0 w-full">
            <FormControl.Label visuallyHidden>Repository URL</FormControl.Label>
            <TextInput
              block
              monospace
              size="large"
              name="repo"
              leadingVisual={RepoIcon}
              placeholder="https://github.com/owner/repo or owner/repo"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setLeft(false);
              }}
              onBlur={() => setLeft(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setLeft(true);
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {input.kind === "invalid" && left ? (
              <FormControl.Validation variant="error">
                That is not owner/repo or a github.com URL.
              </FormControl.Validation>
            ) : null}
          </FormControl>
          {input.kind === "built" ? null : (
            <ExamplePills
              label={input.kind === "empty" ? "Examples" : "Built"}
              examples={examplesOf(built, value)}
              built={built}
              onPick={setValue}
            />
          )}
        </div>
        <Button
          variant="primary"
          size="large"
          type="submit"
          className="shrink-0 max-sm:w-full"
          disabled={blocked}
          trailingVisual={input.kind === "built" ? ArrowRightIcon : undefined}
        >
          {input.kind === "built" ? "Open" : "Build"}
        </Button>
      </form>
      {state?.error ? (
        <p className="m-0 text-[14px] text-(color:--fgColor-danger)">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function ExamplePills({
  label,
  examples,
  built,
  onPick,
}: {
  readonly label: string;
  readonly examples: readonly string[];
  readonly built: readonly string[];
  readonly onPick: (slug: string) => void;
}) {
  if (examples.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        id="repo-examples"
        className="text-[12px] text-(color:--fgColor-muted)"
      >
        {label}
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
