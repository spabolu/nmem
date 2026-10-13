/** Frozen copy of the lab's fixtures/lib/plain.mjs plainHits: jargon and code a non-engineer cannot read. */
const JARGON = [
  "sha",
  "commit",
  "commits",
  "merge",
  "merged",
  "squash",
  "branch",
  "repo",
  "repository",
  "pr",
  "prs",
  "pull request",
  "issue",
  "issues",
  "ci",
  "adr",
  "adrs",
  "schema",
  "module",
  "sqlite",
  "json",
  "redis",
  "middleware",
  "nat",
  "api",
];

const CODE = [
  /\b[0-9a-f]{7,40}\b/i,
  /\b[\w.-]+(?:\/[\w.-]+)+\b/,
  /--[A-Za-z0-9]/,
  /`[^`]+`/,
  /#\d+/,
];

const pattern = new RegExp(
  `\\b(${JARGON.map((w) => w.replace(" ", "\\s+")).join("|")})\\b`,
  "gi",
);

export function plainHits(text: string): string[] {
  const jargon = [...new Set(text.match(pattern) ?? [])];
  return [...jargon, ...CODE.flatMap((code) => text.match(code) ?? [])];
}
