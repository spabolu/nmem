"use client";

import { Button } from "@primer/react";
import { Blank } from "@/components/blank";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main id="main" className="page wide" data-view="error">
      <Blank h1 heading="nmem could not show this page">
        {error.message || "Reading the snapshot failed."}
        {error.digest ? ` (${error.digest})` : ""}
      </Blank>
      <div className="mt-4 flex justify-center">
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </main>
  );
}
