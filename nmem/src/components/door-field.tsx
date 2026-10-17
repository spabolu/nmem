"use client";

import NextLink from "next/link";
import { useEffect, useId, useState } from "react";
import { HINT } from "./styles";

const WAIT_MS = 150;

const FIELD =
  "h-14 w-full rounded-(--borderRadius-medium) border border-(color:--borderColor-default) bg-(--bgColor-default) px-4 text-[20px] text-(color:--fgColor-default) [font-family:inherit] placeholder:text-(color:--fgColor-muted) max-md:h-12 max-md:text-[16px]";

type ShownHit = {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly line: string;
  readonly href: string;
};

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readHits(raw: unknown): readonly ShownHit[] | null {
  if (!raw || typeof raw !== "object" || !("hits" in raw)) return null;
  const hits = raw.hits;
  if (!Array.isArray(hits)) return null;
  const out: ShownHit[] = [];
  for (const row of hits) {
    if (!row || typeof row !== "object") return null;
    const kind = textOf("kind" in row ? row.kind : null);
    const id = textOf("id" in row ? row.id : null);
    const label = textOf("label" in row ? row.label : null);
    const title = textOf("title" in row ? row.title : null);
    const line = textOf("line" in row ? row.line : null);
    const href = textOf("href" in row ? row.href : null);
    if (
      kind === null ||
      id === null ||
      label === null ||
      title === null ||
      line === null ||
      href === null ||
      !href.startsWith("/")
    )
      return null;
    out.push({ kind, id, label, title, line, href });
  }
  return out;
}

function CodeText({ text }: { readonly text: string }) {
  if (!text.includes("`")) return text;
  const parts = text.split("`");
  if (parts.length % 2 === 0) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the split is fixed for one string
      <code key={index}>{part}</code>
    ) : (
      part
    ),
  );
}

export function DoorField({
  action,
  hitsPath,
  audience,
  placeholder,
  headingId,
  children,
}: {
  readonly action: string;
  readonly hitsPath: string;
  readonly audience: "eng" | "plain";
  readonly placeholder: string;
  readonly headingId: string;
  readonly children: React.ReactNode;
}) {
  const listId = useId();
  const [value, setValue] = useState("");
  const [hits, setHits] = useState<readonly ShownHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const q = value.trim();

  useEffect(() => {
    if (q === "") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const url = `${hitsPath}?${new URLSearchParams({ q, audience })}`;
      fetch(url, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          const parsed = readHits(await response.json());
          if (!parsed) throw new Error("unreadable");
          setHits(parsed);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setFailed(true);
          setHits(null);
        });
    }, WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, hitsPath, audience]);

  const shown = q === "" ? null : hits;
  return (
    <>
      <search className="mb-6">
        <form action={action}>
          <input type="hidden" name="audience" value={audience} />
          <input
            className={FIELD}
            type="search"
            name="q"
            value={value}
            autoComplete="off"
            placeholder={placeholder}
            aria-labelledby={headingId}
            aria-controls={listId}
            // biome-ignore lint/a11y/noAutofocus: the page exists to take this query
            autoFocus
            suppressHydrationWarning
            onChange={(event) => {
              const next = event.target.value;
              setValue(next);
              if (next.trim() === "") {
                setHits(null);
                setFailed(false);
              }
            }}
          />
          {q !== "" ? (
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                className="border-0 bg-transparent p-0 text-[14px] text-(color:--fgColor-accent) hover:underline"
              >
                See all results
              </button>
            </div>
          ) : null}
        </form>
      </search>
      <div id={listId} data-door-results>
        {q === "" ? (
          children
        ) : failed ? (
          <p className={HINT}>Could not load results. Press Enter to search.</p>
        ) : shown === null ? (
          <p className={HINT} aria-live="polite">
            Searching.
          </p>
        ) : shown.length === 0 ? (
          <p className={HINT} aria-live="polite">
            No matches.
          </p>
        ) : (
          <ul className="m-0 list-none p-0" aria-live="polite">
            {shown.map((hit) => (
              <li
                key={`${hit.kind}:${hit.id}`}
                className="border-t border-(color:--borderColor-default) py-3"
                data-kind={hit.kind}
                data-id={hit.id}
              >
                <p className="m-0 mb-1 text-[12px] font-[700] uppercase tracking-[0.06em] text-(color:--fgColor-muted)">
                  {hit.label}
                </p>
                <NextLink
                  className="line-clamp-2 text-[16px] font-[600] break-words text-(color:--fgColor-default)!"
                  href={hit.href}
                >
                  <CodeText text={hit.title} />
                </NextLink>
                {hit.line !== "" && hit.line !== hit.title ? (
                  <p className={`${HINT} mt-1 mb-0 line-clamp-2 break-words`}>
                    <CodeText text={hit.line} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
