/**
 * Content addressing. Every cache key, staleness check, stamp, request id and card id goes through hashOf, so two
 * modules can never disagree on how an input is serialized (object keys sorted, arrays kept in order).
 */
export type Hash = string & { readonly __brand: 'Hash' };

export function hashOf(...parts: readonly unknown[]): Hash {
  // TODO: sha256 over canonical JSON of parts (recursively sorted object keys, no whitespace), hex, first 32 chars.
  throw new Error('not implemented');
}

export function hashFiles(paths: readonly string[]): Hash {
  // TODO: hashOf over [relative path, file bytes as base64] pairs, sorted by path. Used for the harness source hash.
  throw new Error('not implemented');
}
