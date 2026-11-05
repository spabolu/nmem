import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppLink } from "@/components/links";
import { Refresh } from "@/components/refresh";
import { RequestButton } from "@/components/request-button";
import { HINT, PAGE, SOURCE_PRE } from "@/components/styles";
import {
  type BuildView,
  buildView,
  logTail,
  type Phase,
  workerAlive,
  workerCommand,
} from "@/lib/jobs";
import type { Audience } from "@/lib/kernel/view";

const PHASE: Record<Phase, string> = {
  fetching: "Fetching the repository from GitHub.",
  quick: "Preparing the first pages.",
  building: "Reading the history.",
  baking: "Preparing the pages.",
};

function ago(iso: string, now: number): string | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hour = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest === 0 ? hour : `${hour} ${rest} minute${rest === 1 ? "" : "s"}`;
}

function moving(view: BuildView): boolean {
  return (
    view.kind === "request" || view.kind === "queued" || view.kind === "running"
  );
}

function headline(view: BuildView, alive: boolean): string {
  if (!alive && moving(view)) return "This build is not moving.";
  switch (view.kind) {
    case "request":
    case "queued":
      return "Waiting to start.";
    case "running":
      return PHASE[view.phase];
    case "failed":
      return "The build failed.";
    case "done":
      return "Finishing the pages.";
    case "unread":
      return view.reason;
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

function since(view: BuildView, now: number): string | null {
  if (view.kind === "unread") return null;
  if (view.kind === "running") {
    const span = ago(view.startedAt, now);
    return span ? `Started ${span} ago.` : null;
  }
  if (view.kind === "failed") {
    const span = ago(view.finishedAt, now);
    return span ? `Failed ${span} ago.` : null;
  }
  const span = ago(view.requestedAt, now);
  return span ? `Requested ${span} ago.` : null;
}

function StartCommand() {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0">
        From the nmem checkout, run this, then come back to this page.
      </p>
      <pre className={SOURCE_PRE}>{workerCommand()}</pre>
    </div>
  );
}

export async function BuildStatus({
  owner,
  name,
  audience,
}: {
  readonly owner: string;
  readonly name: string;
  readonly audience: Audience;
}) {
  await connection();
  const view = buildView(owner, name);
  if (!view) notFound();
  const alive = workerAlive();
  const now = Date.now();
  const slug = `${owner}/${name}`;
  const lines = audience === "eng" ? logTail(owner, name) : [];
  const progress =
    audience === "eng" && view.kind === "running" && view.progress !== ""
      ? view.progress
      : null;
  const elapsed = since(view, now);
  return (
    <main
      id="main"
      className={PAGE.wide}
      data-view="build"
      data-audience={audience}
      data-build-state={view.kind}
      data-build-phase={
        view.kind === "running" || view.kind === "failed"
          ? view.phase
          : undefined
      }
    >
      <Refresh />
      <h1 className="m-0 mb-3 text-[32px] font-[600] break-all max-md:text-[20px]">
        {slug}
      </h1>
      <p className="m-0 mb-2 text-[16px]">{headline(view, alive)}</p>
      {elapsed ? <p className={`${HINT} m-0 mb-3`}>{elapsed}</p> : null}
      {view.kind === "failed" ? (
        <p className="m-0 mb-4 max-w-[68ch] text-[16px] [overflow-wrap:anywhere]">
          {view.reason}
        </p>
      ) : null}
      {progress && lines.length === 0 && progress !== headline(view, alive) ? (
        <p className={`${HINT} m-0 mb-4 [overflow-wrap:anywhere]`}>
          {progress}
        </p>
      ) : null}
      {audience === "eng" && view.kind === "running" && view.attempts > 0 ? (
        <p className={`${HINT} m-0 mb-4`}>
          {`Restarted ${view.attempts} ${view.attempts === 1 ? "time" : "times"} after a stop.`}
        </p>
      ) : null}
      {!alive ? (
        <div className="mb-4 max-w-[68ch]">
          <StartCommand />
        </div>
      ) : null}
      {view.kind === "failed" ? (
        view.retryable ? (
          <RequestButton repo={slug} label="Retry" force variant="primary" />
        ) : (
          <AppLink href="/">Try another repository</AppLink>
        )
      ) : null}
      {view.kind === "unread" ? (
        <RequestButton repo={slug} label="Retry" force variant="primary" />
      ) : null}
      {lines.length > 0 ? (
        <pre className={`${SOURCE_PRE} mt-6`} data-build-log>
          {lines.join("\n")}
        </pre>
      ) : null}
    </main>
  );
}

export async function BuildBanner({
  owner,
  name,
  audience,
  preview,
  className,
}: {
  readonly owner: string;
  readonly name: string;
  readonly audience: Audience;
  readonly preview: boolean;
  readonly className: string;
}) {
  await connection();
  const view = buildView(owner, name);
  const slug = `${owner}/${name}`;
  if (!view || view.kind === "done") return null;
  const alive = workerAlive();
  const line = headline(view, alive);
  const reading = preview && view.kind !== "unread";
  const progress =
    audience === "eng" &&
    view.kind === "running" &&
    view.progress !== "" &&
    view.progress !== line
      ? view.progress
      : null;
  const elapsed = since(view, Date.now());
  return (
    <div
      className={`${className} mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-(color:--borderColor-default) bg-(--bgColor-muted) px-4 py-3`}
      data-build-state={view.kind}
      data-build-phase={
        view.kind === "running" || view.kind === "failed"
          ? view.phase
          : undefined
      }
      data-preview={reading ? "yes" : undefined}
    >
      <Refresh />
      <div className="min-w-0">
        <p className="m-0 text-[14px]">{line}</p>
        {view.kind === "failed" ? (
          <p className={`${HINT} m-0 mt-1 [overflow-wrap:anywhere]`}>
            {view.reason}{" "}
            {reading
              ? "These pages have no decisions yet."
              : "The last finished build is still on this page."}
          </p>
        ) : reading ? (
          <p className={`${HINT} m-0 mt-1`}>nmem is still reading decisions.</p>
        ) : (
          <p className={`${HINT} m-0 mt-1`}>
            This page still shows the last finished build.
          </p>
        )}
        {reading && elapsed ? (
          <p className={`${HINT} m-0 mt-1`}>{elapsed}</p>
        ) : null}
        {progress ? (
          <p className={`${HINT} m-0 mt-1 [overflow-wrap:anywhere]`}>
            {progress}
          </p>
        ) : null}
        {!alive ? <StartCommand /> : null}
      </div>
      {view.kind === "failed" && view.retryable ? (
        <RequestButton repo={slug} label="Retry" force />
      ) : null}
    </div>
  );
}

export function buildStateLine(view: BuildView | null, alive: boolean): string {
  if (!view) return "Not built yet.";
  return headline(view, alive);
}
