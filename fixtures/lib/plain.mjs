/**
 * Wording rules shared by the generator, the harness, and the engine. fixtures/check-plain.mjs and the harness jargon
 * metric read one jargon list, so a word banned in gold plain text is the same word banned in a system's plain text.
 */
export const JARGON = [
  'sha', 'commit', 'commits', 'merge', 'merged', 'squash', 'branch', 'repo', 'repository',
  'pr', 'prs', 'pull request', 'issue', 'issues', 'ci', 'adr', 'adrs', 'schema', 'module',
  'sqlite', 'json', 'redis', 'middleware', 'nat', 'api',
];

/** A SHA, a path, a flag, inline code, and a #n reference, which a non-engineer cannot read either. */
export const CODE = [/\b[0-9a-f]{7,40}\b/i, /\b[\w.-]+(?:\/[\w.-]+)+\b/, /--[A-Za-z0-9]/, /`[^`]+`/, /#\d+/];

/** A sentence saying the change is not meant to change behavior. It shows no intent, so it is never a decision. */
export const DENIAL = /no behaviou?r change/i;

const pattern = new RegExp(`\\b(${JARGON.map((w) => w.replace(' ', '\\s+')).join('|')})\\b`, 'gi');

export function jargonHits(text) {
  return [...new Set(text.match(pattern) ?? [])];
}

/** Every jargon word and code token in a plain string. Empty means a non-engineer can read it. */
export function plainHits(text) {
  return [...jargonHits(text), ...CODE.flatMap((code) => text.match(code) ?? [])];
}
