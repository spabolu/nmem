import NextLink from "next/link";
import { type RepoRef, sourceHref } from "@/lib/hrefs";
import type { Said, Source, Why } from "@/lib/kernel/contract";
import type { Site } from "@/lib/kernel/site";
import type { Audience } from "@/lib/kernel/view";
import { TEMPLATES } from "@/lib/kernel/view";
import { avatarOf, chipOf, person } from "@/lib/present";
import { CHIP } from "./styles";

/** Engineer text marks code with backticks. Plain text never shows code, so it prints as written. */
export function Prose({
  text,
  audience,
}: {
  readonly text: string;
  readonly audience: Audience;
}) {
  if (audience === "plain" || !text.includes("`")) return text;
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

export type Ctx = {
  readonly site: Site;
  readonly repo: RepoRef;
  readonly audience: Audience;
};

export function Chip({
  ctx,
  source,
}: {
  readonly ctx: Ctx;
  readonly source: Source;
}) {
  const chip = chipOf(ctx.site, source, ctx.audience);
  return (
    <NextLink
      className={CHIP}
      data-chip="receipt"
      href={sourceHref(ctx.repo, ctx.audience, chip.target)}
    >
      {chip.label}
    </NextLink>
  );
}

/** A sentence nmem says, followed by the one source it rests on. */
export function SaidText({
  ctx,
  line,
}: {
  readonly ctx: Ctx;
  readonly line: Said;
}) {
  return (
    <>
      <Prose text={line[ctx.audience]} audience={ctx.audience} />{" "}
      <Chip ctx={ctx} source={line.source} />
    </>
  );
}

const TONE = {
  green: "bg-(--bgColor-success-emphasis)",
  blue: "bg-(--bgColor-accent-emphasis)",
  purple: "bg-(--bgColor-done-emphasis)",
  orange: "bg-(--bgColor-severe-emphasis)",
  red: "bg-(--bgColor-danger-emphasis)",
  coral: "bg-(--bgColor-sponsors-emphasis)",
} as const satisfies Record<ReturnType<typeof avatarOf>["tone"], string>;

export function Avatar({
  site,
  login,
  size = 20,
}: {
  readonly site: Site;
  readonly login: string;
  readonly size?: 20 | 32;
}) {
  const avatar = avatarOf(site, login);
  return (
    <span
      className={`inline-grid place-items-center rounded-[50%] font-[700] text-(color:--fgColor-onEmphasis) ${size === 32 ? "size-8 text-[12px]" : "size-5 text-[9px]"} ${TONE[avatar.tone]}`}
      aria-hidden="true"
    >
      {avatar.initials}
    </span>
  );
}

export function WhyText({
  ctx,
  why,
}: {
  readonly ctx: Ctx;
  readonly why: Why;
}) {
  if (why.kind === "recorded") return <SaidText ctx={ctx} line={why.reason} />;
  return TEMPLATES.notRecorded(why.ask.map((login) => person(ctx.site, login)))[
    ctx.audience
  ];
}
