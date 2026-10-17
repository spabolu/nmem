import { topicsHref } from "@/lib/hrefs";
import { parseProof, parseRef } from "@/lib/kernel/contract";
import type { RequestQuery, Site } from "@/lib/kernel/site";
import { formatDay, TRUST_WORDS } from "@/lib/kernel/view";
import { githubUrlOf, person, stamp } from "@/lib/present";
import { Blank } from "./blank";
import { Avatar, type Ctx } from "./said";
import { CALLOUT, H1, HINT, KICKER, LABEL, MUTED, SOURCE_PRE } from "./styles";
import { ToMark } from "./to-mark";

const CBOX = "grid grid-cols-[40px_1fr] gap-3";

function chdClass(hit: boolean): string {
  return `rounded-t-[6px] border border-b-0 bg-(--bgColor-muted) px-4 py-2 text-(color:--fgColor-muted) ${hit ? "border-(color:--borderColor-accent-emphasis)" : "border-(color:--borderColor-default)"}`;
}

const PROSE =
  "[overflow-wrap:anywhere] [&_p]:mt-0 [&_p]:mb-2 [&_p]:whitespace-pre-line [&_p:last-child]:m-0";

/** A message with no comment header above it: a commit body, a tag, a release. */
const BODY = `mt-3 rounded-[6px] border border-(color:--borderColor-default) px-4 py-3 ${PROSE}`;

function cbdClass(hit: boolean): string {
  return `rounded-b-[6px] border px-4 py-3 ${PROSE} ${hit ? "border-(color:--borderColor-accent-emphasis) shadow-[inset_0_0_0_1px_var(--borderColor-accent-emphasis)]" : "border-(color:--borderColor-default)"}`;
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
  const { site } = ctx;
  if (query.proof) return <ProofReceipt ctx={ctx} raw={query.proof} />;
  if (!query.ref)
    return (
      <Missing ctx={ctx} url={null}>
        This address names no source. Sources open from the chips on a topic, a
        search result, or the timeline.
      </Missing>
    );
  const parsed = parseRef(query.ref, site.identity);
  if (!parsed)
    return (
      <Missing ctx={ctx} url={null}>
        nmem cannot read the source this address names.
      </Missing>
    );
  const quote = query.quote;
  const url = githubUrlOf(site, query.ref);
  const absent = (
    <Missing ctx={ctx} url={url}>
      nmem keeps the sources its pages quote, as of the last build, and this is
      not one of them.
    </Missing>
  );
  const callout = quote ? (
    <blockquote className={CALLOUT}>
      <ToMark />
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
        absent={absent}
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
    const body = site.object(query.ref)?.revisions[0];
    if (body === undefined) return absent;
    return (
      <>
        {callout}
        <article>
          <p className={`${KICKER} break-all`}>{parsed.path}</p>
          <h1 className={`${H1} break-all`}>
            {parsed.path.split("/").at(-1) ?? parsed.path}
          </h1>
          <GithubLink url={url} />
          <div className="overflow-auto rounded-[6px] border border-(color:--borderColor-default)">
            <FileLines body={body} lines={parsed.lines} quote={quote} />
          </div>
        </article>
      </>
    );
  }
  const object = site.object(query.ref);
  if (!object) return absent;
  if (parsed.kind === "commit") {
    const facts = site.sourceFacts(query.ref);
    const [subject = "", ...rest] = (object.revisions.at(-1) ?? "").split("\n");
    const body = rest.join("\n").trim();
    return (
      <>
        {callout}
        <article>
          <p className={KICKER}>Commit {parsed.rev.slice(0, 7)}</p>
          <h1 className={`${H1} break-words`} data-record>
            {subject.trim() ? (
              <Marked text={subject.trim()} quote={quote} />
            ) : (
              object.header
            )}
          </h1>
          <p className="m-0 text-(color:--fgColor-muted)">
            {facts?.author ? person(site, facts.author) : "Author unknown"}
            {facts ? ` committed on ${formatDay(facts.day)}.` : "."}
          </p>
          <GithubLink url={url} />
          {body ? (
            <div className={BODY} data-record>
              <Paragraphs text={body} quote={quote} />
            </div>
          ) : null}
        </article>
      </>
    );
  }
  return (
    <>
      {callout}
      <article>
        <h1 className={`${H1} break-words`} data-record>
          {object.header}
        </h1>
        <GithubLink url={url} />
        {object.revisions.at(-1)?.trim() ? (
          <div className={BODY} data-record>
            <Paragraphs text={object.revisions.at(-1) ?? ""} quote={quote} />
          </div>
        ) : null}
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
  if (!needle) return <Linked text={text} />;
  const pattern = needle
    .split(" ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(text);
  if (!match) return <Linked text={text} />;
  return (
    <>
      <Linked text={text.slice(0, match.index)} />
      <mark>{match[0]}</mark>
      <Linked text={text.slice(match.index + match[0].length)} />
    </>
  );
}

const INLINE =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

/** Text with GitHub's inline marks drawn: a [label](link), a `code` span, and a bare web address. */
function Linked({ text }: { readonly text: string }) {
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > at) out.push(text.slice(at, index));
    const [whole, label, link, code, bare] = match;
    if (code !== undefined) out.push(<code key={index}>{code}</code>);
    else
      out.push(
        <a key={index} href={link ?? bare} target="_blank" rel="noreferrer">
          {label === undefined ? (
            bare
          ) : /^`[^`]+`$/.test(label) ? (
            <code>{label.slice(1, -1)}</code>
          ) : (
            label
          )}
        </a>,
      );
    at = index + whole.length;
  }
  if (at === 0) return text;
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/**
 * A GitHub message as blocks: fenced code as code, a heading as a bold line, and the rest as paragraphs that keep
 * their line breaks, so a list stays a list.
 */
function Paragraphs({
  text,
  quote,
}: {
  readonly text: string;
  readonly quote: string;
}) {
  const blocks = text.split(/^```[^\n]*$/m).flatMap((part, index) =>
    index % 2 === 1
      ? [{ code: true, text: part.replace(/^\n|\n$/g, "") }].filter(
          (block) => block.text.trim() !== "",
        )
      : part
          .split(/\n{2,}/)
          .filter((block) => block.trim() !== "")
          .map((block) => ({ code: false, text: block.trim() })),
  );
  return blocks.map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: blocks keep their order
    <Block key={index} code={block.code} text={block.text} quote={quote} />
  ));
}

function Block({
  code,
  text,
  quote,
}: {
  readonly code: boolean;
  readonly text: string;
  readonly quote: string;
}) {
  if (code)
    return (
      <pre className={`${SOURCE_PRE} mb-2 overflow-x-auto whitespace-pre`}>
        {text}
      </pre>
    );
  const heading = /^#{1,6}\s+(.*)$/.exec(text);
  return (
    <p className={heading ? "font-[600]" : undefined}>
      <Marked text={heading?.[1] ?? text} quote={quote} />
    </p>
  );
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
      <div className="min-w-0">
        <header className={chdClass(marked)}>
          <b className="text-(color:--fgColor-default)">{author}</b> {verb} on{" "}
          {stamp(at)}
        </header>
        <div className={cbdClass(marked)} data-record>
          {body.trim() ? (
            <Paragraphs text={body} quote={quote} />
          ) : (
            <p className={MUTED}>No description provided.</p>
          )}
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
  absent,
}: {
  readonly site: Site;
  readonly parent: Parent;
  readonly quote: string;
  readonly focus: number | null;
  readonly url: string | null;
  readonly absent: React.ReactNode;
}) {
  const { github } = site;
  const kicker = (
    <p className={KICKER}>
      {site.identity.owner} / {site.identity.name}
    </p>
  );
  if (parent.kind === "discussion") {
    const row = github.discussions.find((one) => one.number === parent.number);
    if (!row) return absent;
    return (
      <article>
        {kicker}
        <h1 className={`${H1} break-words`} data-record>
          <Marked text={row.title} quote={quote} />{" "}
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
    if (!row) return absent;
    return (
      <article>
        {kicker}
        <h1 className={`${H1} break-words`} data-record>
          <Marked text={row.title} quote={quote} />{" "}
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
  if (!pull) return absent;
  return (
    <article>
      {kicker}
      <h1 className={`${H1} break-words`} data-record>
        <Marked text={pull.title} quote={quote} />{" "}
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
        {pull.author} opened this on {stamp(pull.openedAt)}
        {pull.mergedAt ? `, merged on ${stamp(pull.mergedAt)}` : ""}.
      </p>
      <GithubLink url={url} />
      <div className="mt-4 grid gap-4">
        <CommentBox
          site={site}
          author={pull.author}
          at={pull.openedAt}
          verb="opened this"
          body={pull.body}
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

/** Where a quote sits in a file, as 1-based first and last lines, matching across line breaks and spacing. */
function quoteLines(
  body: string,
  quote: string,
): readonly [number, number] | null {
  const words = squash(quote).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const pattern = words
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(body);
  if (!match) return null;
  const first = body.slice(0, match.index).split("\n").length;
  return [first, first + match[0].split("\n").length - 1];
}

const WHOLE = 200;

function FileLines({
  body,
  lines,
  quote,
}: {
  readonly body: string;
  readonly lines: { readonly start: number; readonly count: number } | null;
  readonly quote: string;
}) {
  if (body.trim() === "")
    return <p className={`${HINT} m-0 px-4 py-3`}>This file is empty.</p>;
  const rows = body.split("\n");
  let hit: readonly [number, number] | null = null;
  let note: string | null = null;
  if (lines) {
    if (lines.start > rows.length)
      note = `Line ${lines.start} is past the end of this file, which has ${rows.length} lines.`;
    else
      hit = [lines.start, Math.min(rows.length, lines.start + lines.count - 1)];
  } else if (quote.trim()) {
    hit = quoteLines(body, quote);
    if (!hit) note = "The quoted words are not in this version of the file.";
  }
  const from = hit ? Math.max(1, hit[0] - 4) : 1;
  const to = hit
    ? Math.min(rows.length, Math.max(hit[1] + 4, from + 12))
    : Math.min(rows.length, WHOLE);
  const on = (n: number) => hit !== null && n >= hit[0] && n <= hit[1];
  return (
    <>
      {note ? (
        <p className="m-0 border-b border-(color:--borderColor-default) bg-(--bgColor-attention-muted) px-4 py-2 text-[14px]">
          {note}
        </p>
      ) : null}
      {to - from + 1 < rows.length ? (
        <p className={`${HINT} m-0 px-4 pt-3`}>
          Lines {from}-{to} of {rows.length}.
        </p>
      ) : null}
      <div
        className="py-2 [font:12px/20px_var(--fontStack-monospace)]"
        data-record
      >
        {rows.slice(from - 1, to).map((row, index) => {
          const n = from + index;
          return (
            <div key={n} className={lineClass(on(n))}>
              <span className={lineNumberClass(on(n))}>{n}</span>
              <span className="whitespace-pre">
                {on(n) ? <Marked text={row} quote={quote} /> : row}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

async function ProofReceipt({
  ctx,
  raw,
}: {
  readonly ctx: Ctx;
  readonly raw: string;
}) {
  const { site, audience } = ctx;
  const parsed = parseProof(raw);
  if (!parsed)
    return (
      <Missing ctx={ctx} url={null}>
        nmem cannot read the check this address names.
      </Missing>
    );
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

/** A source nmem cannot show, with the way back to the repo and, when the address names one, the way to GitHub. */
function Missing({
  ctx,
  url,
  children,
}: {
  readonly ctx: Ctx;
  readonly url: string | null;
  readonly children: React.ReactNode;
}) {
  return (
    <Blank
      h1
      heading="nmem has no record of this source"
      action={{
        href: topicsHref(ctx.repo, ctx.audience),
        label: `Back to ${ctx.repo.name}`,
      }}
      footer={
        url ? (
          <p className="mt-3 mb-0">
            <a href={url} target="_blank" rel="noreferrer">
              Look for it on GitHub
            </a>
          </p>
        ) : null
      }
    >
      {children}
    </Blank>
  );
}
