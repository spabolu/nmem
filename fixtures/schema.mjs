/**
 * Contract between repo specs (fixtures/specs/<slug>.mjs) and the generator (fixtures/generate.mjs).
 * A spec module default-exports a RepoSpec. The generator parses it at the boundary and rejects anything off-shape.
 *
 * @typedef {string} IsoTime
 *   "2024-03-02T10:00:00Z" or with an offset, "2024-03-02T10:00:00-05:00". Order is by instant.
 *   Git dates keep the written offset, so a commit made in New York shows -0500 in `git log`.
 * @typedef {string} Handle  key into RepoSpec.people
 *
 * @typedef {{ name: string, email: string, linked: boolean }} Identity
 *   A git identity a person commits under. `linked: false` means GitHub cannot map the email to the account,
 *   so the commit shows the raw name with no login (a real-world identity split).
 *
 * @typedef {{
 *   name: string, email: string, role: string,
 *   kind?: "User" | "Bot",
 *   identities?: Record<string, Identity>
 * }} Person
 *   kind defaults to "User". Bot handles end in "[bot]" (e.g. "dependabot[bot]") and may not review or close discussions.
 *
 * @typedef {Record<string, string | null>} FileChanges  path -> full new content, or null to delete
 *
 * @typedef {{ key: string, at: IsoTime, author: Handle, identity?: string, via?: "web", message: string, files: FileChanges }} CommitSpec
 *   key is a stable symbolic id ("c-init"); SHAs are resolved by the generator.
 *   identity selects one of the author's `identities`; omitted means the person's primary name/email.
 *   via "web" is an edit made in GitHub's web editor: committed by "GitHub <noreply@github.com>".
 *
 * @typedef {"+1" | "-1" | "laugh" | "hooray" | "confused" | "heart" | "rocket" | "eyes"} Reaction
 * @typedef {Partial<Record<Reaction, Handle[]>>} Reactions
 *
 * @typedef {{ id: string, author: Handle, at: IsoTime, body: string, edits?: Array<{ at: IsoTime, body: string }>, reactions?: Reactions }} Comment
 *   body is the text as first posted at `at`. edits are later revisions in time order; the last one is what GitHub shows now.
 *
 * @typedef {{
 *   id: string, author: Handle, at: IsoTime,
 *   state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED",
 *   body: string,
 *   threads: Array<{ id: string, path: string, line: number, resolved?: boolean, comments: Comment[] }>
 * }} Review
 *   A review applies to the latest PR commit at or before its time (emitted as commitSha).
 *   Thread comments after the first may come from anyone; the first comment's author must be the review author,
 *   and it is posted with the review, so its time is at or before the review's time. Replies may come later.
 *
 * @typedef {{ name: string, commit: string, at: IsoTime, conclusion: "success" | "failure" | "cancelled" | "skipped", summary: string }} CheckRun
 *   CI result on one PR commit key.
 *
 * @typedef {{
 *   type: "pr", number: number, title: string, author: Handle, body: string, labels: string[],
 *   branch: string, openedAt: IsoTime,
 *   assignees?: Handle[], requestedReviewers?: Handle[],
 *   reactions?: Reactions,
 *   commits: CommitSpec[],
 *   reviews: Review[],
 *   comments: Comment[],
 *   checks?: CheckRun[],
 *   outcome:
 *     | { kind: "merged", at: IsoTime, by: Handle, method?: "merge" | "squash" }
 *     | { kind: "closed", at: IsoTime, by: Handle }
 * }} PullRequestStep
 *   Branches from main's tip, applies commits in order, then lands or closes. Commits, reviews, comments and checks may
 *   interleave in time (a fix pushed after "changes requested"); each list is in time order and all sit between
 *   openedAt and the outcome. The first review must follow at least one commit.
 *   method "merge" (default) makes a --no-ff merge commit authored by the merger. "squash" makes one commit on main
 *   authored by the PR author, titled "<title> (#n)" with "* <subject>" lines, or for a single-commit PR that commit's
 *   own subject with " (#n)" and its body. Both are committed by "GitHub <noreply@github.com>", as GitHub's web merge does.
 *   A merged PR whose body says "Closes #n", "Fixes #n" or "Resolves #n" (any case/tense) closes issue n at merge time.
 *
 * @typedef {{
 *   type: "issue", number: number, title: string, author: Handle, at: IsoTime, body: string, labels: string[],
 *   assignees?: Handle[], reactions?: Reactions,
 *   comments: Comment[],
 *   outcome?:
 *     | { kind: "closed", at: IsoTime, by: Handle, reason: "completed" | "not_planned" }
 *     | { kind: "duplicate", at: IsoTime, by: Handle, of: number }
 * }} IssueStep
 *   No outcome means open, unless a merged PR closes it. Setting an outcome on an issue a PR closes is a spec error.
 *
 * @typedef {{
 *   type: "discussion", number: number, title: string, category: "Ideas" | "Q&A" | "General" | "Announcements",
 *   author: Handle, at: IsoTime, body: string, reactions?: Reactions,
 *   comments: Array<Comment & { replies: Comment[] }>,
 *   answer?: string
 * }} DiscussionStep
 *   answer is the id of the top-level comment marked as the answer; only valid in the Q&A category.
 *
 * @typedef {{ type: "commit" } & CommitSpec} DirectCommitStep  pushed straight to main
 * @typedef {{ type: "tag", name: string, at: IsoTime, by: Handle, message: string, release?: { title: string, body: string } }} TagStep
 *   Annotated tag on main's tip. release adds a GitHub release with notes on that tag.
 *
 * @typedef {DirectCommitStep | PullRequestStep | IssueStep | DiscussionStep | TagStep} Step
 *   Issue, PR and discussion numbers share one sequence per repo and increase with creation time (openedAt or at).
 *   Gaps are allowed (deleted or transferred items).
 *
 * Evidence. Every ref carries a verbatim quote that the generator proves is present in the referenced object.
 * @typedef {
 *   | { kind: "commit", key: string, quote: string }                  quote in commit message
 *   | { kind: "file", path: string, at: string, quote: string }       quote in file content at commit key `at`
 *   | { kind: "pr", number: number, quote: string }                   quote in PR title or body
 *   | { kind: "issue", number: number, quote: string }                quote in issue title or body
 *   | { kind: "comment", id: string, quote: string, revision?: number }
 *       any PR/issue comment, review body, review-thread comment, discussion comment or reply.
 *       Matches the current text by default; revision 0 is the original post, n is the nth edit.
 *   | { kind: "discussion", number: number, quote: string }           quote in discussion title or body
 *   | { kind: "tag", name: string, quote: string }                    quote in tag message or release title/body
 * } Ref
 *
 * @typedef {{
 *   id: string,
 *   view: "timeline" | "docs",
 *   facet: "growth" | "decision" | "adr" | "reversal" | "unwritten-why" | "how" | "who" | "overview" | "noise",
 *   job?: "find-context" | "currency" | "catch-up" | "why",
 *   question: string,
 *   answers: { technical: string, nonTechnical: string },
 *   evidence: Ref[],
 *   onlyOutsideGit?: string[],
 *   expect?: "answer" | "gap",
 *   truth?: string,
 *   notRecorded?: string[]
 * }} AnswerKeyEntry
 *   job is the user job the question tests (docs/research-takeaways.md). When omitted it is derived from facet:
 *   growth and reversal -> catch-up; decision, adr and unwritten-why -> why; how, who and overview -> find-context;
 *   noise has no default and must set job.
 *   onlyOutsideGit: marker phrases that must appear in at least one cited PR, issue, comment or discussion text and
 *   nowhere in git (no file content at any commit, no commit message, no tag message).
 *   expect "gap" means the correct answer is that the record does not say. The answers explain what is and is not
 *   recorded; evidence cites what does exist (the change itself). truth is the real reason, known only to the fixture
 *   author, and is never emitted into github.json or the repo. notRecorded lists phrases from that truth that must
 *   appear nowhere at all: no git content, commit or tag message, and no GitHub-side text. Both are required for a gap.
 *   Typed mentions in answer text ("PR #4", "issue #7", "discussion #3") must name an existing item of that kind.
 *
 * @typedef {{
 *   id: string,
 *   kind: "identity-split" | "misleading-message" | "bot-noise" | "duplicate" | "corrected-claim" | "edited-comment"
 *       | "squash-merge" | "timezone" | "off-topic" | "dangling-reference",
 *   description: string,
 *   evidence: Ref[]
 * }} NoiseNote
 *   Deliberate mess planted to test robustness. Listed so an evaluation can tell planted noise from generator bugs.
 *
 * Output shape (github.json) follows the GitHub API, not the spec: times are UTC with "Z", and comments, reviews and
 * threads carry numeric ids derived deterministically from the spec id. Spec ids never appear in github.json; they are
 * mapped to numeric ids in answer-key.json and noise.json so evidence still resolves. A landing commit's own "(#n)" is
 * not a cross-reference.
 *
 * @typedef {{
 *   slug: string, name: string, owner: string, description: string,
 *   people: Record<Handle, Person>,
 *   steps: Step[],
 *   answerKey: AnswerKeyEntry[],
 *   noise?: NoiseNote[]
 * }} RepoSpec
 */
export {};
