"use client";

import { SearchIcon } from "@primer/octicons-react";
import { Blankslate } from "@primer/react/experimental";

/** Primer's Blankslate. Its parts are dotted members, which a server component cannot reach through the client boundary. */
export function Blank({
  heading,
  children,
  action,
  search,
  h1,
}: {
  readonly heading: string;
  readonly children: React.ReactNode;
  readonly action?: { readonly href: string; readonly label: string };
  readonly search?: boolean;
  readonly h1?: boolean;
}) {
  return (
    <Blankslate border spacious>
      {search ? (
        <Blankslate.Visual>
          <SearchIcon size="medium" />
        </Blankslate.Visual>
      ) : null}
      <Blankslate.Heading as={h1 ? "h1" : "h2"}>{heading}</Blankslate.Heading>
      <Blankslate.Description>{children}</Blankslate.Description>
      {action ? (
        <Blankslate.PrimaryAction href={action.href}>
          {action.label}
        </Blankslate.PrimaryAction>
      ) : null}
    </Blankslate>
  );
}
