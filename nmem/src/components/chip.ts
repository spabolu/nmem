/**
 * The pill every chip shares: receipts, topic tags, and the timeline's topic picks. Color and hover carry `!` because
 * Primer BaseStyles and the global `a` rule are unlayered and would beat Tailwind's utilities layer.
 */
export const CHIP =
  "inline-flex items-center rounded-[2em] border border-solid border-(color:--borderColor-default) bg-transparent px-2 text-[12px] leading-[18px] font-[500] text-(color:--fgColor-default)! hover:no-underline!";

export const CHIP_ON =
  "inline-flex items-center rounded-[2em] border border-solid border-(color:--bgColor-emphasis) bg-(--bgColor-emphasis) px-2 text-[12px] leading-[18px] font-[500] text-(color:--fgColor-onEmphasis)! hover:no-underline!";
