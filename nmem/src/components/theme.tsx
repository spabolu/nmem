"use client";

import { BaseStyles } from "@primer/react";
import { ThemeProvider } from "@primer/react/next";

export function Theme({ children }: { readonly children: React.ReactNode }) {
  return (
    <ThemeProvider colorMode="auto" preventSSRMismatch>
      <BaseStyles>{children}</BaseStyles>
    </ThemeProvider>
  );
}
