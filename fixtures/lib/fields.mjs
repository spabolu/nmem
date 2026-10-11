export class SpecError extends Error {
  constructor(slug, fieldPath, detail) {
    super(`${slug}: ${fieldPath}: ${detail}`);
    this.name = 'SpecError';
    this.slug = slug;
    this.fieldPath = fieldPath;
  }
}

export function object(value, path, ctx) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    ctx.fail(path, 'expected object');
  }
  return value;
}

export function rejectUnknown(value, path, ctx, known) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) ctx.fail(`${path}.${key}`, 'unknown field');
  }
}

export function requireFields(obj, path, ctx, keys) {
  for (const key of keys) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
}

export function nonEmpty(value, path, ctx) {
  if (typeof value !== 'string' || value.length === 0) {
    ctx.fail(path, `expected non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function text(value, path, ctx) {
  if (typeof value !== 'string') ctx.fail(path, `expected string, got ${JSON.stringify(value)}`);
  return value;
}

export function integer(value, path, ctx) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    ctx.fail(path, `expected integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function positive(value, path, ctx) {
  const n = integer(value, path, ctx);
  if (n < 1) ctx.fail(path, `expected positive integer, got ${n}`);
  return n;
}

export function boolean(value, path, ctx) {
  if (typeof value !== 'boolean') ctx.fail(path, `expected boolean, got ${JSON.stringify(value)}`);
  return value;
}

export function oneOf(value, path, ctx, options) {
  const s = text(value, path, ctx);
  if (!options.includes(s)) ctx.fail(path, `expected one of ${options.join(', ')}, got ${JSON.stringify(s)}`);
  return s;
}

export function filePath(value, path, ctx) {
  const rel = nonEmpty(value, path, ctx);
  const bad = rel.startsWith('/')
    || rel.includes('\\')
    || rel.includes(':')
    || rel === '.git'
    || rel.startsWith('.git/')
    || rel.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
  if (bad) ctx.fail(path, `invalid file path ${JSON.stringify(rel)}`);
  return rel;
}

export function array(value, path, ctx, { min = 0 } = {}) {
  if (!Array.isArray(value)) ctx.fail(path, 'expected array');
  if (value.length < min) ctx.fail(path, `expected at least ${min} item${min === 1 ? '' : 's'}`);
  return value;
}
