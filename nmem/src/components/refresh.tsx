"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function Refresh({ ms = 3000 }: { readonly ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), ms);
    return () => window.clearInterval(id);
  }, [router, ms]);
  return null;
}
