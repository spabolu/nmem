import { parseProof, parseRef } from "@/lib/kernel/contract";
import type { RequestQuery, Site } from "@/lib/kernel/site";
import { formatDay, TRUST_WORDS } from "@/lib/kernel/view";
import { githubUrlOf, person, stamp } from "@/lib/present";
import { Avatar, type Ctx } from "./said";

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
    return <p className="miss">A receipt needs a ref or a proof.</p>;
  const parsed = parseRef(query.ref, site.identity);
  if (!parsed) return <p className="miss">nmem could not read this source.</p>;
  const quote = query.quote;
  const url = githubUrlOf(site, query.ref);
  const callout = quote ? (
    <blockquote className="callout source">
      <span className="lbl">The page quotes</span>
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
        <article className="gh">
          <p className="kicker">{parsed.path}</p>
          <h1>{parsed.path.split("/").at(-1) ?? parsed.path}</h1>
          <GithubLink url={url} />
          <div className="blob">
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
        <article className="gh">
          <p className="kicker">Commit</p>
          <h1>{object?.header ?? query.ref}</h1>
          <p className="pr-state">
            {facts?.author ? person(site, facts.author) : "unknown"} on{" "}
            {facts ? formatDay(facts.day) : ""}
          </p>
          <GithubLink url={url} />
          <div className="cbox">
            <div className="cbd">
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
        <p className="miss">This source is not in the workspace record.</p>
        <GithubLink url={url} />
      </>
    );
  }
  return (
    <>
      {callout}
      <article className="gh">
        <h1>{object.header}</h1>
        <GithubLink url={url} />
        <div className="cbox">
          <div className="cbd">
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
    <article
      className={`cbox${marked ? " hit" : ""}`}
      id={id === undefined ? undefined : `c${id}`}
    >
      <Avatar site={site} login={author} size={32} />
      <div>
        <header className="chd">
          <b>{author}</b> {verb} on {stamp(at)}
        </header>
        <div className="cbd">
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
    <p className="kicker">
      {site.identity.owner} / {site.identity.name}
    </p>
  );
  if (parent.kind === "discussion") {
    const row = github.discussions.find((one) => one.number === parent.number);
    if (!row)
      return (
        <p className="miss">This source is not in the workspace record.</p>
      );
    return (
      <article className="gh">
        {kicker}
        <h1>
          {row.title} <span className="num">#{row.number}</span>
        </h1>
        <p className="pr-state">
          {row.author} opened this discussion on {stamp(row.at)}.
        </p>
        <GithubLink url={url} />
        <div className="thread">
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
        <p className="miss">This source is not in the workspace record.</p>
      );
    return (
      <article className="gh">
        {kicker}
        <h1>
          {row.title} <span className="num">#{row.number}</span>
        </h1>
        <p className="pr-state">
          {row.author} opened this on {stamp(row.openedAt)}.
        </p>
        <GithubLink url={url} />
        <div className="thread">
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
    return <p className="miss">This source is not in the workspace record.</p>;
  return (
    <article className="gh">
      {kicker}
      <h1>
        {pull.title} <span className="num">#{pull.number}</span>
      </h1>
      <p className="pr-state">
        {pull.mergedAt ? (
          <span className="merged">Merged</span>
        ) : (
          <span className="open">Open</span>
        )}{" "}
        {pull.author}{" "}
        {pull.mergedAt
          ? `merged this on ${stamp(pull.mergedAt)}`
          : `opened this on ${stamp(pull.openedAt)}`}
        .
      </p>
      <GithubLink url={url} />
      <div className="thread">
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
        <p className="hint">
          Lines {from}-{to} of {rows.length}.
        </p>
      ) : null}
      <div className="code">
        {rows.slice(from - 1, to).map((row, index) => {
          const n = from + index;
          return (
            <div key={n} className={`ln${n >= start && n <= end ? " hl" : ""}`}>
              <span className="n">{n}</span>
              <span className="s">
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
  if (!parsed) return <p className="miss">nmem could not read this check.</p>;
  const words = TRUST_WORDS[parsed.verb][audience];
  const result = site.proof(raw) ?? {
    failed: "missing",
    detail:
      "The lab did not bake this check; rebuild this repo with nmem build-repo.",
  };
  return (
    <article className="gh">
      <h1 data-nmem>{words}</h1>
      {"failed" in result ? (
        <p className="miss">nmem could not run this check. {result.detail}</p>
      ) : (
        <pre className="source">{result.text}</pre>
      )}
    </article>
  );
}
