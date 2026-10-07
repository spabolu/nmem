/**
 * Contract between repo specs (fixtures/specs/<slug>.mjs) and the generator (fixtures/generate.mjs).
 * A spec module default-exports a RepoSpec. The generator parses it at the boundary and rejects anything off-shape.
 *
 * @typedef {string} IsoTime  UTC, e.g. "2024-03-02T10:00:00Z". Steps must be non-decreasing in time.
 * @typedef {string} Handle   key into RepoSpec.people
 *
 * @typedef {{ name: string, email: string, role: string }} Person
 *
 * @typedef {Record<string, string | null>} FileChanges  path -> full new content, or null to delete
 *
 * @typedef {{ key: string, at: IsoTime, author: Handle, message: string, files: FileChanges }} CommitSpec
 *   key is a stable symbolic id ("c-init"); SHAs are resolved by the generator.
 *
 * @typedef {{ id: string, author: Handle, at: IsoTime, body: string }} Comment
 *
 * @typedef {{
 *   id: string, author: Handle, at: IsoTime,
 *   state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED",
 *   body: string,
 *   threads: Array<{ id: string, path: string, line: number, comments: Comment[] }>
 * }} Review
 *
 * @typedef {{
 *   type: "pr", number: number, title: string, author: Handle, body: string, labels: string[],
 *   branch: string, openedAt: IsoTime,
 *   commits: CommitSpec[],
 *   reviews: Review[],
 *   comments: Comment[],
 *   outcome: { kind: "merged", at: IsoTime, by: Handle } | { kind: "closed", at: IsoTime, by: Handle }
 * }} PullRequestStep
 *   Branches from main's current tip, applies commits, then merges with --no-ff (merge commit) or is closed unmerged.
 *
 * @typedef {{
 *   type: "discussion", number: number, title: string, category: "Ideas" | "Q&A" | "General" | "Announcements",
 *   author: Handle, at: IsoTime, body: string,
 *   comments: Array<Comment & { replies: Comment[] }>
 * }} DiscussionStep
 *   PR and discussion numbers share one sequence per repo, as on GitHub.
 *
 * @typedef {{ type: "commit" } & CommitSpec} DirectCommitStep  pushed straight to main
 * @typedef {{ type: "tag", name: string, at: IsoTime, by: Handle, message: string }} TagStep  annotated tag on main's tip
 *
 * @typedef {DirectCommitStep | PullRequestStep | DiscussionStep | TagStep} Step
 *
 * Evidence. Every ref carries a verbatim quote that the generator proves is present in the referenced object.
 * @typedef {
 *   | { kind: "commit", key: string, quote: string }                  quote in commit message
 *   | { kind: "file", path: string, at: string, quote: string }       quote in file content at commit key `at`
 *   | { kind: "pr", number: number, quote: string }                   quote in PR title or body
 *   | { kind: "comment", id: string, quote: string }                  any PR comment, review body, review-thread comment, discussion comment or reply
 *   | { kind: "discussion", number: number, quote: string }           quote in discussion title or body
 *   | { kind: "tag", name: string, quote: string }                    quote in tag message
 * } Ref
 *
 * @typedef {{
 *   id: string,
 *   view: "timeline" | "docs",
 *   facet: "growth" | "decision" | "adr" | "reversal" | "unwritten-why" | "how" | "who" | "overview",
 *   question: string,
 *   answers: { technical: string, nonTechnical: string },
 *   evidence: Ref[],
 *   onlyOutsideGit?: string[]
 * }} AnswerKeyEntry
 *   onlyOutsideGit: marker phrases that must appear in at least one cited PR/discussion text and nowhere in git
 *   (no file content at any commit, no commit message, no tag message). This is how a planted "unwritten" fact is proven.
 *
 * @typedef {{
 *   slug: string, name: string, owner: string, description: string,
 *   people: Record<Handle, Person>,
 *   steps: Step[],
 *   answerKey: AnswerKeyEntry[]
 * }} RepoSpec
 */
export {};
