import "server-only";
import type {
  ChangeId,
  LocalId,
  Login,
  RecordRef,
  Source,
  Topic,
} from "@/lib/kernel/contract";
import { parseProof, parseRef } from "@/lib/kernel/contract";
import { plainHits } from "@/lib/kernel/plain";
import type { Site } from "@/lib/kernel/site";
import type { Audience, Card, IsoDay, Item, Status } from "@/lib/kernel/view";
import {
  cardDay,
  formatDay,
  labelChange,
  MONTHS,
  TRUST_WORDS,
} from "@/lib/kernel/view";

/**
 * Words and positions the pages print that the kernel does not compute: source labels, card names, avatar initials,
 * and the timeline board geometry. Ported from web/render.ts.
 */

export function person(site: Site, login: string): string {
  return site.facts.people.get(login as Login) ?? login;
}

const AVATAR_TONES = [
  "green",
  "blue",
  "purple",
  "orange",
  "red",
  "coral",
] as const;
type AvatarTone = (typeof AVATAR_TONES)[number];

export function avatarOf(
  site: Site,
  login: string,
): { readonly initials: string; readonly tone: AvatarTone } {
  let n = 0;
  for (const ch of login) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  const name = person(site, login);
  const parts = name.split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
      : name.slice(0, 2);
  return {
    initials: letters.toUpperCase(),
    tone: AVATAR_TONES[n % AVATAR_TONES.length] ?? "green",
  };
}

export function stamp(iso: string | undefined): string {
  if (!iso || iso.length < 10) return "";
  return formatDay(iso.slice(0, 10) as IsoDay);
}

export function topicById(site: Site, id: LocalId): Topic | undefined {
  return site.snapshot.topics.find((topic) => topic.id === id);
}

export function depthOf(site: Site, id: LocalId): number {
  let depth = 0;
  let current = topicById(site, id);
  const seen = new Set<string>();
  while (current?.parent && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = topicById(site, current.parent);
  }
  return Math.min(depth, 2);
}

/** The topic's ancestors, root first. */
export function ancestors(site: Site, topic: Topic): readonly Topic[] {
  const chain: Topic[] = [];
  let current: Topic | undefined = topic;
  const seen = new Set<string>();
  while (current?.parent && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = topicById(site, current.parent);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export function dotOf(status: Status): "none" | "stale" | "ok" {
  if (status.kind === "never-written") return "none";
  if (status.kind === "out-of-date-since") return "stale";
  return "ok";
}

function quotedLine(
  site: Site,
  raw: string,
  ref: RecordRef & { kind: "file" },
  quote: string | undefined,
): string {
  if (ref.lines) {
    return ref.lines.count === 1
      ? `line ${ref.lines.start}`
      : `lines ${ref.lines.start}-${ref.lines.start + ref.lines.count - 1}`;
  }
  const text = site.object(raw)?.revisions.at(-1) ?? "";
  const first = (quote ?? "").split("\n")[0] ?? "";
  const index = first
    ? text.split("\n").findIndex((line) => line.includes(first))
    : -1;
  return index >= 0 ? `line ${index + 1}` : "";
}

function sourceLabel(
  site: Site,
  ref: string,
  audience: Audience,
  quote?: string,
): string {
  const parsed = parseRef(ref, site.identity);
  const facts = site.sourceFacts(ref);
  const name = facts?.author ? person(site, facts.author) : null;
  const day = facts ? formatDay(facts.day) : "";
  const plain = audience === "plain";
  if (!parsed) return plain ? "the source" : ref;
  switch (parsed.kind) {
    case "pr":
      return plain
        ? "the change's description"
        : `PR #${parsed.number} description`;
    case "commit":
      if (plain) return "the change itself";
      return name
        ? `${name}'s commit, ${day}`
        : labelChange(parsed.rev as ChangeId);
    case "discussion":
      return plain ? "a team discussion" : `discussion #${parsed.number}`;
    case "issue":
      return plain ? "a team conversation" : `issue #${parsed.number}`;
    case "comment":
      if (plain) return name ? `${name}'s message` : "a message";
      return name ? `${name}'s message, ${day}` : "a comment";
    case "file":
      return plain
        ? "the file"
        : `${parsed.path} ${quotedLine(site, ref, parsed, quote)}`.trim();
    case "tag":
      return plain ? "a release note" : `tag ${parsed.name}`;
    default:
      return plain ? "the source" : ref;
  }
}

/** What a source chip says and where it opens. */
export function chipOf(
  site: Site,
  source: Source,
  audience: Audience,
): {
  readonly label: string;
  readonly target: {
    readonly ref?: string;
    readonly quote?: string;
    readonly proof?: string;
  };
} {
  if (source.kind === "proof") {
    const parsed = parseProof(source.proof);
    return {
      label: parsed ? TRUST_WORDS[parsed.verb][audience] : "the check",
      target: { proof: source.proof },
    };
  }
  return {
    label: sourceLabel(site, source.ref, audience, source.quote),
    target: { ref: source.ref, quote: source.quote },
  };
}

export function githubUrlOf(site: Site, ref: string): string | null {
  if (!ref) return null;
  return site.sourceFacts(ref)?.url ?? null;
}

export function isBareCommit(text: string): boolean {
  return /^(?:commit\s+)?[0-9a-f]{7,40}$/i.test(text.trim());
}

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() ?? "";
}

function recordTitle(site: Site, id: string): string {
  const pull = /^pr#(\d+)$/.exec(id);
  if (pull) {
    const number = Number(pull[1]);
    return firstLine(
      site.github.pulls.find((row) => row.number === number)?.title ?? "",
    );
  }
  const parsed = parseRef(id, site.identity);
  if (!parsed || parsed.kind !== "commit") return "";
  return firstLine(site.object(id)?.revisions[0] ?? "");
}

export function namedChange(
  site: Site,
  id: string,
  day: IsoDay,
  audience: Audience,
): string {
  const title = recordTitle(site, id);
  if (audience === "plain") {
    if (title && plainHits(title).length === 0) return title;
    return `A change on ${formatDay(day)}`;
  }
  if (title) return title;
  const pull = /^pr#(\d+)$/.exec(id);
  return pull ? `PR #${pull[1]}` : "A commit with no message";
}

export function itemSource(site: Site, item: Item): Source | null {
  if (item.kind === "decision") {
    return (
      site.snapshot.decisions.find((row) => row.id === item.ref)?.what.source ??
      null
    );
  }
  if (item.kind === "net") {
    const id = item.ref.replace(/^undone:/, "");
    return (
      site.snapshot.undone.find((group) => group.changes[0] === id)?.says[0]
        ?.source ?? null
    );
  }
  const finding = /^(.+)\/(\d+)$/.exec(item.ref);
  if (!finding?.[1]) return null;
  const change = site.snapshot.changes.find((row) => row.id === finding[1]);
  return change?.findings[Number(finding[2])]?.says[0]?.source ?? null;
}

export function itemText(site: Site, item: Item, audience: Audience): string {
  if (item.kind === "decision") {
    return (
      site.snapshot.decisions.find((row) => row.id === item.ref)?.what[
        audience
      ] ?? item.ref
    );
  }
  if (item.kind === "net") {
    const id = item.ref.replace(/^undone:/, "");
    return (
      site.snapshot.undone.find((group) => group.changes[0] === id)?.name[
        audience
      ] ?? item.ref
    );
  }
  const finding = /^(.+)\/(\d+)$/.exec(item.ref);
  if (finding?.[1]) {
    const change = site.snapshot.changes.find((row) => row.id === finding[1]);
    const name = change?.findings[Number(finding[2])]?.name[audience];
    if (name && !isBareCommit(name)) return name;
  }
  return namedChange(site, finding?.[1] ?? item.ref, item.day, audience);
}

/** A card's day, with its year unless it falls in the year the record ends, so a timeline over years stays unambiguous. */
export function shortWhen(site: Site, day: IsoDay): string {
  return day.slice(0, 4) === site.facts.end.slice(0, 4)
    ? formatDay(day).replace(/, \d{4}$/, "")
    : formatDay(day);
}

export const BOARD = { cardPct: 16, laneH: 148, axisH: 72, inset: 6 } as const;

export type Slot = {
  readonly card: Card;
  readonly left: number;
  readonly lane: number;
  readonly more: number;
  readonly folded: boolean;
};

function dayNum(iso: string): number {
  return (
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    ) / 86_400_000
  );
}

export function pct(day: string, from: string, to: string): number {
  const span = dayNum(to) - dayNum(from);
  if (span <= 0) return 50;
  const at = Math.max(0, Math.min(1, (dayNum(day) - dayNum(from)) / span));
  return BOARD.inset + at * (100 - 2 * BOARD.inset);
}

export function cardId(card: Card): string {
  if (card.kind === "decision") return card.row.decision.id;
  if (card.kind === "net") return `undone:${card.changes[0] ?? ""}`;
  return card.change;
}

/** Places a row's cards left to right in lanes. Closed, a card that would overlap an earlier one folds into its +N. */
export function packRow(
  cards: readonly Card[],
  from: IsoDay,
  to: IsoDay,
  open: boolean,
): { readonly slots: readonly Slot[]; readonly lanes: number } {
  const slots: Slot[] = [];
  const laneRight: number[] = [];
  for (const card of cards) {
    const at = pct(cardDay(card), from, to);
    const left = Math.max(
      0,
      Math.min(100 - BOARD.cardPct, at - BOARD.cardPct / 2),
    );
    if (!open) {
      const hit = slots.find(
        (slot) => !slot.folded && left < slot.left + BOARD.cardPct + 1,
      );
      if (hit) {
        slots[slots.indexOf(hit)] = { ...hit, more: hit.more + 1 };
        slots.push({ card, left, lane: hit.lane, more: 0, folded: true });
        continue;
      }
    }
    let lane = laneRight.findIndex((right) => left + 0.5 >= right);
    if (lane < 0) {
      lane = laneRight.length;
      laneRight.push(left + BOARD.cardPct + 1);
    } else {
      laneRight[lane] = left + BOARD.cardPct + 1;
    }
    slots.push({ card, left, lane, more: 0, folded: false });
  }
  return { slots, lanes: Math.max(1, laneRight.length) };
}

type Tick = {
  readonly label: string;
  readonly at: number;
  readonly edge: "start" | "end" | null;
};

/** One tick a month over a year or less; over longer ranges a tick each year, or every few years, labelled by year alone. */
export function ticksOf(from: IsoDay, to: IsoDay): readonly Tick[] {
  const ticks: Tick[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  const years = Number(to.slice(0, 4)) - year;
  const everyYears = years < 2 ? 0 : Math.ceil(years / 10);
  const edge = (at: number): Tick["edge"] =>
    at <= BOARD.inset + 1
      ? "start"
      : at >= 100 - BOARD.inset - 1
        ? "end"
        : null;
  while (`${year}-${String(month).padStart(2, "0")}` <= end) {
    const day = `${year}-${String(month).padStart(2, "0")}-01`;
    if (day >= from && day <= to && everyYears === 0) {
      const label =
        month === 1 || ticks.length === 0
          ? `${MONTHS[month - 1] ?? ""} ${year}`
          : (MONTHS[month - 1] ?? "");
      const at = pct(day, from, to);
      ticks.push({ label, at, edge: edge(at) });
    } else if (
      day > from &&
      day <= to &&
      month === 1 &&
      year % everyYears === 0
    ) {
      const at = pct(day, from, to);
      ticks.push({ label: String(year), at, edge: edge(at) });
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}
