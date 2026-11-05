import { MarkGithubIcon } from "@primer/octicons-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function GlobalBar({
  children,
  navigation,
}: {
  readonly children?: ReactNode;
  readonly navigation?: ReactNode;
}) {
  return (
    <header
      data-repo-band={navigation ? true : undefined}
      className={`bg-(--bgColor-inset) text-(color:--fgColor-default)${navigation ? "" : " shadow-[inset_0_-1px_0_var(--borderColor-muted)]"}`}
    >
      <div className="flex h-16 min-w-0 items-center gap-4 px-4">
        <Link
          href="/"
          className="inline-flex h-8 shrink-0 items-center gap-2 text-(color:--fgColor-default)! hover:no-underline!"
        >
          <MarkGithubIcon size={32} />
          <span className="text-[16px] font-[600]">nmem</span>
        </Link>
        {children}
      </div>
      {navigation}
    </header>
  );
}
