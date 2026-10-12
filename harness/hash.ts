/**
 * Content addressing. Every cache key, staleness check, stamp, request id and card id goes through hashOf, so two
 * modules can never disagree on how an input is serialized (object keys sorted, arrays kept in order).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type Hash = string & { readonly __brand: 'Hash' };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function hashOf(...parts: readonly unknown[]): Hash {
  const body = JSON.stringify(canonical(parts));
  return createHash('sha256').update(body).digest('hex').slice(0, 32) as Hash;
}

export function hashFiles(paths: readonly string[]): Hash {
  const root = paths.reduce((dir, file) => {
    const next = path.dirname(file);
    if (dir === '' || next.length < dir.length) return next;
    return dir;
  }, '');
  const pairs = paths
    .map((file) => [path.relative(root, file), fs.readFileSync(file).toString('base64')] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return hashOf(pairs);
}
