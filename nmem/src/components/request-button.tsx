"use client";

import { Button } from "@primer/react";
import { useActionState } from "react";
import { requestBuild } from "@/lib/build-request";

export function RequestButton({
  repo,
  label,
  force = false,
  variant = "default",
  size = "small",
}: {
  readonly repo: string;
  readonly label: string;
  readonly force?: boolean;
  readonly variant?: "default" | "primary";
  readonly size?: "small" | "medium" | "large";
}) {
  const [state, action, pending] = useActionState(requestBuild, null);
  return (
    <form action={action} className="flex shrink-0 flex-col items-start gap-1">
      <input type="hidden" name="repo" value={repo} />
      {force ? <input type="hidden" name="force" value="1" /> : null}
      <Button type="submit" size={size} variant={variant} disabled={pending}>
        {label}
      </Button>
      {state?.error ? (
        <span className="text-[12px] text-(color:--fgColor-danger)">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
