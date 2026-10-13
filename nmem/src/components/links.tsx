"use client";

import { Button, Link, LinkButton } from "@primer/react";
import NextLink from "next/link";
import type { ComponentProps } from "react";

type LinkProps = Omit<ComponentProps<typeof Link>, "as" | "href"> & {
  readonly href: string;
};

/** Primer's Link, routed through next/link. Server components pass strings, this file owns the component prop. */
export function AppLink({ href, ...rest }: LinkProps) {
  return <Link as={NextLink} href={href} {...rest} />;
}

type ButtonProps = {
  readonly href: string;
  readonly children: React.ReactNode;
  readonly size?: "small" | "medium" | "large";
  readonly variant?: "default" | "primary" | "invisible";
  readonly external?: boolean;
};

export function ButtonLink({
  href,
  children,
  size,
  variant,
  external,
}: ButtonProps) {
  if (external) {
    return (
      <Button
        as="a"
        href={href}
        size={size}
        variant={variant}
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </Button>
    );
  }
  return (
    <LinkButton as={NextLink} href={href} size={size} variant={variant}>
      {children}
    </LinkButton>
  );
}
