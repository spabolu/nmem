/**
 * The one jargon list. fixtures/check-plain.mjs and the harness jargon metric both read it, so a word banned in
 * gold plain text is the same word banned in a system's plain text.
 */
export const JARGON = [
  'sha', 'commit', 'commits', 'merge', 'merged', 'squash', 'branch', 'repo', 'repository',
  'pr', 'prs', 'pull request', 'issue', 'issues', 'ci', 'adr', 'adrs', 'schema', 'module',
  'sqlite', 'json', 'redis', 'middleware', 'nat', 'api',
];

const pattern = new RegExp(`\\b(${JARGON.map((w) => w.replace(' ', '\\s+')).join('|')})\\b`, 'gi');

export function jargonHits(text) {
  return [...new Set(text.match(pattern) ?? [])];
}
