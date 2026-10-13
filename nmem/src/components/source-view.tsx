import { parseProof, parseRef } from "@/lib/kernel/contract";
import type { RequestQuery, Site } from "@/lib/kernel/site";
import { formatDay, TRUST_WORDS } from "@/lib/kernel/view";
import { githubUrlOf, person, stamp } from "@/lib/present";
import { Avatar, type Ctx } from "./said";
import { CALLOUT, H1, HINT, KICKER, LABEL, MUTED, SOURCE_PRE } from "./styles";

const CBOX = "grid grid-cols-[40px_1fr] gap-3";

function chdClass(hit: boolean): string {
  return `rounded-t-[6px] border border-b-0 bg-(--bgColor-muted) px-4 py-2 text-(color:--fgColor-muted) ${hit ? "border-(color:--borderColor-accent-emphasis)" : "border-(color:--borderColor-default)"}`;
}

function cbdClass(hit: boolean): string {
  return `rounded-b-[6px] border px-4 py-3 [&_p]:mt-0 [&_p]:mb-2 [&_p:last-child]:m-0 ${hit ? "border-(color:--borderColor-accent-emphasis) shadow-[inset_0_0_0_1px_var(--borderColor-accent-emphasis)]" : "border-(color:--borderColor-default)"}`;
}

function lineClass(hit: boolean): string {
  return `grid grid-cols-[54px_1fr] ${hit ? "bg-(--bgColor-attention-muted)" : ""}`;
}

function lineNumberClass(hit: boolean): string {
  return `pr-3 text-right ${hit ? "text-(color:--fgColor-default) shadow-[inset_3px_0_0_var(--bgColor-nmem-emphasis)]" : "text-(color:--fgColor-muted)"}`;
}

type Comment = {
  readonly id: number;
  readonly author: string;
  readonly body: string;
  readonly createdAt?: string;
  readonly at?: string;
  readonly replies?: readonly Comment[];
};

type Parent = {
  readonly kind: "discussion" | "issue" | "pr";
  readonly number: number;
};

/** The receipt behind a chip: the quoted thread, file lines, commit, or check output, with the quote marked. */
export async function SourceView({
  ctx,
  query,
}: {
  readonly ctx: Ctx;
  readonly query: RequestQuery;
}) {
  const { site, audience } = ctx;
  if (query.proof)
    return <ProofReceipt site={site} raw={query.proof} audience={audience} />;
  if (!query.ref)
    return <p className={MUTED}>A receipt needs a ref or a proof.</p>;
  const parsed = parseRef(query.ref, site.identity);
  if (!parsed) return <p className={MUTED}>nmem could not read this source.</p>;
  const quote = query.quote;
  const url = githubUrlOf(site, query.ref);
  const callout = quote ? (
    <blockquote className={CALLOUT}>
      <span className={LABEL}>The page quotes</span>
      {quote}
    </blockquote>
  ) : null;
  const thread = (parent: Parent, focus: number | null) => (
    <>
      {callout}
      <Thread
        site={site}
        parent={parent}
        quote={quote}
        focus={focus}
        url={url}
      />
    </>
  );
  if (
    parsed.kind === "discussion" ||
    parsed.kind === "issue" ||
    parsed.kind === "pr"
  ) {
    return thread({ kind: parsed.kind, number: parsed.number }, null);
  }
  if (parsed.kind === "comment") {
    const parent = parentOf(site, parsed.id);
    if (parent) return thread(parent, parsed.id);
  }
  if (parsed.kind === "file") {
    const body = site.object(query.ref)?.revisions[0] ?? "";
    return (
      <>
        {callout}
        <article>
          <p className={KICKER}>{parsed.path}</p>
          <h1 className={H1}>{parsed.path.split("/").at(-1) ?? parsed.path}</h1>
          <GithubLink url={url} />
          <div className="overflow-auto rounded-[6px] border border-(color:--borderColor-default)">
            <FileLines body={body} lines={parsed.lines} quote={quote} />
          </div>
        </article>
      </>
    );
  }
  const object = site.object(query.ref);
  if (parsed.kind === "commit") {
    const facts = site.sourceFacts(query.ref);
    return (
      <>
        {callout}
        <article>
          <p className={KICKER}>Commit</p>
          <h1 className={H1}>{object?.header ?? query.ref}</h1>
          <p className="border-b border-(color:--borderColor-default) pb-3 text-(color:--fgColor-muted)">
            {facts?.author ? person(site, facts.author) : "unknown"} on{" "}
            {facts ? formatDay(facts.day) : ""}
          </p>
          <GithubLink url={url} />
          <div className={CBOX}>
            <div className={cbdClass(false)}>
              <Paragraphs text={object?.revisions.at(-1) ?? ""} quote={quote} />
            </div>
          </div>
        </article>
      </>
    );
  }
  if (!object) {
    return (
      <>
        {callout}
        <p className={MUTED}>This source is not in the workspace record.</p>
        <GithubLink url={url} />
      </>
    );
  }
  return (
    <>
      {callout}
      <article>
        <h1 className={H1}>{object.header}</h1>
        <GithubLink url={url} />
        <div className={CBOX}>
          <div className={cbdClass(false)}>
            <Paragraphs text={object.revisions.at(-1) ?? ""} quote={quote} />
          </div>
        </div>
      </article>
    </>
  );
}

function GithubLink({ url }: { readonly url: string | null }) {
  if (!url) return null;
  return (
    <p className="gh-link">
      <a href={url} target="_blank" rel="noreferrer">
        View on GitHub
      </a>
    </p>
  );
}

function hasId(comments: readonly Comment[], id: number): boolean {
  return comments.some(
    (comment) => comment.id === id || hasId(comment.replies ?? [], id),
  );
}

function parentOf(site: Site, id: number): Parent | null {
  const { github } = site;
  for (const row of github.discussions)
    if (hasId(row.comments, id))
      return { kind: "discussion", number: row.number };
  for (const row of github.issues)
    if (hasId(row.comments, id)) return { kind: "issue", number: row.number };
  for (const pull of github.pulls) {
    if (hasId(pull.comments, id)) return { kind: "pr", number: pull.number };
    for (const review of pull.reviews) {
      if (
        review.id === id ||
        review.threads.some((thread) => hasId(thread.comments, id))
      ) {
        return { kind: "pr", number: pull.number };
      }
    }
  }
  return null;
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hit(
  body: string,
  quote: string,
  id: number,
  focus: number | null,
): boolean {
  if (focus !== null && id === focus) return true;
  if (!quote.trim()) return false;
  return squash(body).includes(squash(quote));
}

function Marked({
  text,
  quote,
}: {
  readonly text: string;
  readonly quote: string;
}) {
  const needle = squash(quote);
  if (!needle) return text;
  const pattern = needle
    .split(" ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(text);
  if (!match) return text;
  return (
    <>
      {text.slice(0, match.index)}
      <mark>{match[0]}</mark>
      {text.slice(match.index + match[0].length)}
    </>
  );
}

function Paragraphs({
  text,
  quote,
}: {
  readonly text: string;
  readonly quote: string;
}) {
  return text.split(/\n{2,}/).map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs keep their order
    <p key={index}>
      <Marked text={block} quote={quote} />
    </p>
  ));
}

function CommentBox({
  site,
  author,
  at,
  verb,
  body,
  quote,
  marked,
  id,
}: {
  readonly site: Site;
  readonly author: string;
  readonly at: string | undefined;
  readonly verb: string;
  readonly body: string;
  readonly quote: string;
  readonly marked: boolean;
  readonly id?: number;
}) {
  return (
    <article className={CBOX} id={id === undefined ? undefined : `c${id}`}>
      <Avatar site={site} login={author} size={32} />
      <div>
        <header className={chdClass(marked)}>
          <b className="text-(color:--fgColor-default)">{author}</b> {verb} on{" "}
          {stamp(at)}
        </header>
        <div className={cbdClass(marked)}>
          <Paragraphs text={body} quote={quote} />
        </div>
      </div>
    </article>
  );
}

function Comments({
  site,
  comments,
  quote,
  focus,
}: {
  readonly site: Site;
  readonly comments: readonly Comment[];
  readonly quote: string;
  readonly focus: number | null;
}) {
  const flat: Comment[] = [];
  const walk = (rows: readonly Comment[]): void => {
    for (const row of rows) {
      flat.push(row);
      if (row.replies) walk(row.replies);
    }
  };
  walk(comments);
  return flat.map((comment) => (
    <CommentBox
      key={comment.id}
      site={site}
      id={comment.id}
      author={comment.author}
      at={comment.createdAt ?? comment.at}
      verb="commented"
      body={comment.body}
      quote={quote}
      marked={hit(comment.body, quote, comment.id, focus)}
    />
  ));
}

function Thread({
  site,
  parent,
  quote,
  focus,
  url,
}: {
  readonly site: Site;
  readonly parent: Parent;
  readonly quote: string;
  readonly focus: number | null;
  readonly url: string | null;
}) {
  const { github } = site;
  const kicker = (
    <p className={KICKER}>
      {site.identity.owner} / {site.identity.name}
    </p>
  );
  if (parent.kind === "discussion") {
    const row = github.discussions.find((one) => one.number === parent.number);
    if (!row)
      return (
        <p className={MUTED}>This source is not in the workspace record.</p>
      );
    return (
      <article>
        {kicker}
        <h1 className={H1}>
          {row.title}{" "}
          <span className="font-[400] text-(color:--fgColor-muted)">
            #{row.number}
          </span>
        </h1>
        <p className="border-b border-(color:--borderColor-default) pb-3 text-(color:--fgColor-muted)">
          {row.author} opened this discussion on {stamp(row.at)}.
        </p>
        <GithubLink url={url} />
        <div className="mt-4 grid gap-4">
          <CommentBox
            site={site}
            author={row.author}
            at={row.at}
            verb="started this discussion"
            body={row.body}
            quote={quote}
            marked={hit(row.body, quote, -1, null)}
          />
          <Comments
            site={site}
            comments={row.comments}
            quote={quote}
            focus={focus}
          />
        </div>
      </article>
    );
  }
  if (parent.kind === "issue") {
    const row = github.issues.find((one) => one.number === parent.number);
    if (!row)
      return (
        <p className={MUTED}>This source is not in the workspace record.</p>
      );
    return (
      <article>
        {kicker}
        <h1 className={H1}>
          {row.title}{" "}
          <span className="font-[400] text-(color:--fgColor-muted)">
            #{row.number}
          </span>
        </h1>
        <p className="border-b border-(color:--borderColor-default) pb-3 text-(color:--fgColor-muted)">
          {row.author} opened this on {stamp(row.openedAt)}.
        </p>
        <GithubLink url={url} />
        <div className="mt-4 grid gap-4">
          <CommentBox
            site={site}
            author={row.author}
            at={row.openedAt}
            verb="opened this"
            body={row.body}
            quote={quote}
            marked={hit(row.body, quote, -1, null)}
          />
          <Comments
            site={site}
            comments={row.comments}
            quote={quote}
            focus={focus}
          />
        </div>
      </article>
    );
  }
  const pull = github.pulls.find((one) => one.number === parent.number);
  if (!pull)
    return <p className={MUTED}>This source is not in the workspace record.</p>;
  return (
    <article>
      {kicker}
      <h1 className={H1}>
        {pull.title}{" "}
        <span className="font-[400] text-(color:--fgColor-muted)">
          #{pull.number}
        </span>
      </h1>
      <p className="border-b border-(color:--borderColor-default) pb-3 text-(color:--fgColor-muted)">
        {pull.mergedAt ? (
          <span className="inline-flex rounded-[2em] bg-(--bgColor-done-emphasis) px-3 py-1 text-[14px] font-[600] text-(color:--fgColor-onEmphasis)">
            Merged
          </span>
        ) : (
          <span>Open</span>
        )}{" "}
        {pull.author}{" "}
        {pull.mergedAt
          ? `merged this on ${stamp(pull.mergedAt)}`
          : `opened this on ${stamp(pull.openedAt)}`}
        .
      </p>
      <GithubLink url={url} />
      <div className="mt-4 grid gap-4">
        <CommentBox
          site={site}
          author={pull.author}
          at={pull.openedAt}
          verb="opened this"
          body={`${pull.title}\n\n${pull.body}`}
          quote={quote}
          marked={hit(pull.body, quote, -1, null)}
        />
        <Comments
          site={site}
          comments={pull.comments}
          quote={quote}
          focus={focus}
        />
        {pull.reviews.map((review) => (
          <div key={review.id} className="contents">
            <CommentBox
              site={site}
              id={review.id}
              author={review.author}
              at={review.at}
              verb="reviewed"
              body={review.body}
              quote={quote}
              marked={
                review.id === focus || hit(review.body, quote, review.id, focus)
              }
            />
            <Comments
              site={site}
              comments={review.threads.flatMap((thread) => thread.comments)}
              quote={quote}
              focus={focus}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function FileLines({
  body,
  lines,
  quote,
}: {
  readonly body: string;
  readonly lines: { readonly start: number; readonly count: number } | null;
  readonly quote: string;
}) {
  const rows = body.split("\n");
  let start = 1;
  let end = Math.min(rows.length, 40);
  if (lines) {
    start = lines.start;
    end = lines.start + lines.count - 1;
  } else if (quote) {
    const at = rows.findIndex((row) =>
      row.replace(/\s+/g, " ").includes(squash(quote)),
    );
    if (at >= 0) {
      start = at + 1;
      end = at + 1;
    }
  }
  const from = Math.max(1, start - 4);
  const to = Math.min(rows.length, Math.max(end + 4, from + 12));
  return (
    <>
      {to - from + 1 < rows.length ? (
        <p className={HINT}>
          Lines {from}-{to} of {rows.length}.
        </p>
      ) : null}
      <div className="py-2 [font:12px/20px_var(--fontStack-monospace)]">
        {rows.slice(from - 1, to).map((row, index) => {
          const n = from + index;
          return (
            <div key={n} className={lineClass(n >= start && n <= end)}>
              <span className={lineNumberClass(n >= start && n <= end)}>
                {n}
              </span>
              <span className="whitespace-pre">
                <Marked text={row} quote={quote} />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

async function ProofReceipt({
  site,
  raw,
  audience,
}: {
  readonly site: Site;
  readonly raw: string;
  readonly audience: Ctx["audience"];
}) {
  const parsed = parseProof(raw);
  if (!parsed) return <p className={MUTED}>nmem could not read this check.</p>;
  const words = TRUST_WORDS[parsed.verb][audience];
  const result = site.proof(raw) ?? {
    failed: "missing",
    detail:
      "The lab did not bake this check; rebuild this repo with nmem build-repo.",
  };
  return (
    <article>
      <h1 className={H1} data-nmem>
        {words}
      </h1>
      {"failed" in result ? (
        <p className={MUTED}>nmem could not run this check. {result.detail}</p>
      ) : (
        <pre className={SOURCE_PRE}>{result.text}</pre>
      )}
    </article>
  );
}
