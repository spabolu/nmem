/**
 * The pill every chip shares: receipts, topic tags, and the timeline's topic picks. Color and hover carry `!` because
 * Primer BaseStyles and the global `a` rule are unlayered and would beat Tailwind's utilities layer.
 */
export const CHIP =
  "inline-flex items-center rounded-[2em] border border-solid border-(color:--borderColor-default) bg-transparent px-2 text-[12px] leading-[18px] font-[500] text-(color:--fgColor-default)! hover:no-underline!";

export const CHIP_ON =
  "inline-flex items-center rounded-[2em] border border-solid border-(color:--bgColor-emphasis) bg-(--bgColor-emphasis) px-2 text-[12px] leading-[18px] font-[500] text-(color:--fgColor-onEmphasis)! hover:no-underline!";

export const TEXT_INPUT =
  "h-8 w-full rounded-(--borderRadius-medium) border border-(color:--borderColor-default) bg-(--bgColor-default) px-3 [font:inherit] text-(color:--fgColor-default)";

export const PANEL =
  "overflow-hidden rounded-[8px] border border-(color:--borderColor-default) bg-(--bgColor-default)";
export const PANEL_HD =
  "border-b border-(color:--borderColor-default) bg-(--bgColor-muted) px-4 py-3 text-[12px] text-(color:--fgColor-muted)";
export const PANEL_TITLE = "block text-[14px] text-(color:--fgColor-default)";

const NODE =
  "grid grid-cols-[16px_1fr] gap-2 border-t border-l-4 border-(color:--borderColor-muted) py-2 pr-4 text-(color:--fgColor-default)! hover:no-underline!";
const NODE_DEPTH = ["pl-3", "pl-7", "pl-11"];

/** A row in the topic tree: indented by depth, tinted when it is the page you are on. */
export function nodeClass(depth: number, on: boolean): string {
  const tone = on
    ? "border-l-(color:--bgColor-nmem-emphasis) bg-(--bgColor-nmem-muted)"
    : "border-l-transparent hover:bg-(--bgColor-muted)";
  return `${NODE} ${NODE_DEPTH[depth] ?? "pl-3"} ${tone}`;
}

const PAGE_BASE =
  "mx-auto max-w-[1280px] px-8 pt-6 pb-12 max-md:px-4 max-md:pt-4 max-md:pb-8";

/** main's frame: wide pages fill the column, split pages put the topic tree beside the content. */
export const PAGE = {
  wide: PAGE_BASE,
  split: `${PAGE_BASE} grid grid-cols-[300px_minmax(0,1fr)] items-start gap-8 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-6`,
} as const;

export const MUTED = "text-(color:--fgColor-muted)";
export const KICKER = "m-0 mb-1 text-(color:--fgColor-muted)";
export const H1 = "m-0 mb-3 text-[32px] font-[600] max-md:text-[20px]";
export const LABEL =
  "mb-1 block text-[12px] font-[700] uppercase tracking-[0.06em] text-(color:--fgColor-accent)";
export const CALLOUT =
  "mx-0 my-2 rounded-[6px] bg-(--bgColor-attention-muted) px-3 py-2";
export const SOURCE_PRE =
  "whitespace-pre-wrap rounded-[6px] border border-(color:--borderColor-default) bg-(--bgColor-muted) p-3 [font:12px/20px_var(--fontStack-monospace)]";
export const HINT = "text-[14px] text-(color:--fgColor-muted)";
