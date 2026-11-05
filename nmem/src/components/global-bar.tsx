import { MarkGithubIcon } from "@primer/octicons-react";
import Link from "next/link";

/** The one banner. It knows no repo and emits no data-audience, so the page's audience stays the first one. */
export function GlobalBar() {
  return (
    <header className="flex h-14 items-center border-b border-(color:--header-borderColor-divider) bg-(--header-bgColor) px-4 md:h-16 md:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-(color:--header-fgColor-default)! hover:no-underline!"
      >
        <span className="text-(color:--header-fgColor-logo)">
          <MarkGithubIcon size={32} />
        </span>
        <span className="text-[16px] font-[600]">nmem</span>
      </Link>
    </header>
  );
}
