/**
 * Item histories: every symbol, option, config key, and file in a repo, followed through the harness change list
 * (fixtures/lib/facts.mjs, first-parent on main, before..after per change). Deterministic and dependency-free. Each
 * language is one row of LANGUAGES; the scanners, the history walk, and the matching are shared.
 */
import { git } from '../fixtures/lib/git.mjs';
import type { ChangeId } from './contract.ts';

export type ItemKind = 'symbol' | 'option' | 'config-key' | 'file';
export type Hop =
  | { readonly change: ChangeId; readonly kind: 'introduced' | 'changed' | 'removed'; readonly matchedBy: 'name' }
  | { readonly change: ChangeId; readonly kind: 'renamed' | 'moved' | 'extracted-from'; readonly from: string; readonly matchedBy: 'text' };
export type Item = { readonly kind: ItemKind; name: string; path: string | null; readonly formerNames: string[]; readonly hops: Hop[] };
export type ChangeRange = { readonly id: ChangeId; readonly before: string; readonly after: string };

type RegionKind = Exclude<ItemKind, 'file'>;
type Region = { readonly kind: RegionKind; readonly name: string; readonly text: string };

type Line = {
  readonly text: string;
  readonly start: boolean;
  readonly depth: number;
  readonly endDepth: number;
  readonly indent: number;
  readonly blank: boolean;
  readonly first: string;
  readonly last: string;
};

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

function skipQuoted(text: string, i: number, quote: string): number {
  for (let j = i + 1; j < text.length; j += 1) {
    if (text[j] === '\\') j += 1;
    else if (text[j] === quote) return j;
  }
  return text.length - 1;
}

function skipRegex(text: string, i: number): number {
  let inClass = false;
  for (let j = i + 1; j < text.length; j += 1) {
    const c = text[j];
    if (c === '\\') j += 1;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      while (j + 1 < text.length && /[a-z]/.test(text[j + 1] ?? '')) j += 1;
      return j;
    }
  }
  return text.length - 1;
}

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

function splitLines(source: string): string[] {
  return source.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

function scanBraces(source: string, flavor: 'js' | 'go'): Line[] {
  const out: Line[] = [];
  let depth = 0;
  let mode: 'code' | 'comment' | 'template' | 'raw' = 'code';
  const templates: number[] = [];
  let prev = '';
  let word = '';
  for (const text of splitLines(source)) {
    const start = mode === 'code';
    const startDepth = depth;
    let first = '';
    let last = '';
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i] ?? '';
      if (mode === 'comment') {
        if (c === '*' && text[i + 1] === '/') {
          mode = 'code';
          i += 1;
        }
        continue;
      }
      if (mode === 'raw') {
        if (c === '`') mode = 'code';
        continue;
      }
      if (mode === 'template') {
        if (c === '\\') i += 1;
        else if (c === '`') mode = 'code';
        else if (c === '$' && text[i + 1] === '{') {
          templates.push(depth);
          depth += 1;
          i += 1;
          mode = 'code';
        }
        continue;
      }
      if (c === ' ' || c === '\t') continue;
      if (c === '/' && text[i + 1] === '/') break;
      if (c === '/' && text[i + 1] === '*') {
        mode = 'comment';
        i += 1;
        continue;
      }
      if (!first) first = c;
      if (/[\w$]/.test(c)) {
        let j = i;
        while (j + 1 < text.length && /[\w$]/.test(text[j + 1] ?? '')) j += 1;
        word = text.slice(i, j + 1);
        i = j;
        last = prev = text[j] ?? '';
        continue;
      }
      const afterWord = word;
      word = '';
      if (c === '"' || c === "'") i = skipQuoted(text, i, c);
      else if (c === '`') mode = flavor === 'go' ? 'raw' : 'template';
      else if (c === '/' && flavor === 'js' && (!/[\w$)\]]/.test(prev) || REGEX_AFTER_WORD.has(afterWord))) {
        i = skipRegex(text, i);
        last = prev = ')';
        continue;
      } else if (c === '{' || c === '(' || c === '[') depth += 1;
      else if (c === '}' || c === ')' || c === ']') {
        depth = Math.max(0, depth - 1);
        if (c === '}' && templates.length > 0 && templates.at(-1) === depth) {
          templates.pop();
          mode = 'template';
        }
      }
      last = prev = c;
    }
    out.push({ text, start, depth: startDepth, endDepth: depth, indent: indentOf(text), blank: start && first === '', first, last });
  }
  return out;
}

function scanPython(source: string): Line[] {
  const out: Line[] = [];
  let depth = 0;
  let triple: string | null = null;
  for (const text of splitLines(source)) {
    const start = depth === 0 && triple === null;
    const startDepth = depth;
    let first = '';
    let last = '';
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i] ?? '';
      if (triple !== null) {
        if (c === '\\') i += 1;
        else if (text.startsWith(triple, i)) {
          triple = null;
          i += 2;
        }
        continue;
      }
      if (c === ' ' || c === '\t') continue;
      if (c === '#') break;
      if (!first) first = c;
      last = c;
      if (c === '"' || c === "'") {
        const q3 = c.repeat(3);
        if (text.startsWith(q3, i)) {
          const close = text.indexOf(q3, i + 3);
          if (close === -1) {
            triple = q3;
            break;
          }
          i = close + 2;
        } else i = skipQuoted(text, i, c);
      } else if (c === '{' || c === '(' || c === '[') depth += 1;
      else if (c === '}' || c === ')' || c === ']') depth = Math.max(0, depth - 1);
    }
    out.push({ text, start, depth: startDepth, endDepth: depth, indent: indentOf(text), blank: start && first === '', first, last });
  }
  return out;
}

const CONTINUES_AFTER = new Set(['=', ',', '(', '[', '{', '+', '-', '*', '/', '%', '&', '|', '?', ':', '<', '!', '.', '\\']);
const CONTINUES_BEFORE = new Set(['.', '?', ':', '|', '&', '{', '=']);

function nextCode(lines: readonly Line[], i: number): Line | undefined {
  for (let j = i + 1; j < lines.length; j += 1) {
    const line = lines[j];
    if (line && line.first !== '') return line;
  }
  return undefined;
}

function braceStatementEnd(lines: readonly Line[], i: number): number {
  const base = lines[i]?.depth ?? 0;
  for (let j = i; j < lines.length; j += 1) {
    const line = lines[j];
    if (!line) break;
    if (line.endDepth < base) return j;
    if (line.endDepth > base || line.first === '') continue;
    const arrow = line.last === '>' && line.text.trimEnd().endsWith('=>');
    if (CONTINUES_AFTER.has(line.last) || arrow) continue;
    const next = nextCode(lines, j);
    if (next && next.start && CONTINUES_BEFORE.has(next.first) && !next.text.trimStart().startsWith('...')) continue;
    return j;
  }
  return lines.length - 1;
}

function pythonStatementEnd(lines: readonly Line[], i: number): number {
  let j = i;
  while (j + 1 < lines.length && !(lines[j + 1]?.start ?? true)) j += 1;
  return j;
}

function pythonBlockEnd(lines: readonly Line[], i: number): number {
  const indent = lines[i]?.indent ?? 0;
  let end = pythonStatementEnd(lines, i);
  for (let j = end + 1; j < lines.length; j += 1) {
    const line = lines[j];
    if (!line || line.blank) continue;
    if (line.start && line.indent <= indent) break;
    end = j;
  }
  return end;
}

type Span = { readonly from: number; readonly to: number };
type Declaration = {
  readonly re: RegExp;
  readonly kind: RegionKind;
  readonly container?: true;
  readonly group?: true;
};
type OptionFound = { readonly name: string; readonly decl: readonly Span[]; readonly reads: RegExp | null };
type CodeRules = {
  readonly scan: (source: string) => Line[];
  readonly block: 'indent' | 'braces';
  readonly declarations: readonly Declaration[];
  readonly member: RegExp | null;
  readonly options: (lines: readonly Line[], source: string, statementEnd: (i: number) => number) => OptionFound[];
  readonly env: RegExp | null;
};
type Language = { readonly files: RegExp; readonly regions: (source: string) => Region[] };

const NOT_MEMBERS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'new', 'super', 'await', 'typeof', 'else', 'do', 'try', 'with']);

function pythonArgparse(lines: readonly Line[], source: string, statementEnd: (i: number) => number): OptionFound[] {
  const namespaces = new Set(['args']);
  for (const match of source.matchAll(/(\w+)\s*(?:,\s*\w+\s*)?=\s*[\w.]*\.parse_(?:known_)?(?:intermixed_)?args\(/g)) namespaces.add(match[1] ?? 'args');
  const ns = [...namespaces].join('|');
  const out: OptionFound[] = [];
  lines.forEach((line, i) => {
    if (!line.start || !/\.add_(?:argument|option)\(/.test(line.text)) return;
    const to = statementEnd(i);
    const call = lines.slice(i, to + 1).map((l) => l.text).join('\n');
    const args = call.slice(call.search(/\.add_(?:argument|option)\(/));
    const positional = args.split(/\b\w+\s*=(?!=)/)[0] ?? '';
    const names = [...positional.matchAll(/(['"])([^'"]+)\1/g)].map((m) => m[2] ?? '');
    const name = names.find((n) => n.startsWith('--')) ?? names[0];
    if (!name) return;
    const dest = /\bdest\s*=\s*(['"])(\w+)\1/.exec(args)?.[2] ?? name.replace(/^-+/, '').replace(/-/g, '_');
    out.push({ name, decl: [{ from: i, to }], reads: new RegExp(`\\b(?:${ns})\\.${dest}\\b|getattr\\(\\s*(?:${ns})\\s*,\\s*['"]${dest}['"]`) });
  });
  return out;
}

function scriptOptions(lines: readonly Line[], source: string): OptionFound[] {
  const out: OptionFound[] = [];
  const holders = new Set(['options', 'opts']);
  const typeNames: string[] = [];
  lines.forEach((line, i) => {
    const type = /^(?:export\s+)?(?:interface|type)\s+([\w$]*(?:Options|Opts|Config|Settings))\b/.exec(line.text);
    if (!type || line.depth !== 0) return;
    typeNames.push(type[1] ?? '');
    const end = braceStatementEnd(lines, i);
    for (let j = i + 1; j <= end; j += 1) {
      const field = lines[j];
      if (!field || !field.start || field.depth !== 1) continue;
      const name = /^\s*(?:readonly\s+)?([\w$]+)\??\s*:/.exec(field.text)?.[1];
      if (!name) continue;
      let to = j;
      while ((lines[to]?.endDepth ?? 0) > 1 && to < end) to += 1;
      out.push({ name, decl: [{ from: j, to }], reads: null });
    }
  });
  for (const typeName of typeNames) {
    for (const match of source.matchAll(new RegExp(`([\\w$]+)\\??\\s*:\\s*(?:Partial<|Readonly<|Required<)?${typeName}\\b`, 'g'))) holders.add(match[1] ?? 'options');
  }
  const holder = [...holders].join('|');
  const read = (name: string): RegExp => new RegExp(`\\b(?:${holder})\\??\\.${name.replace(/\$/g, '\\$')}\\b`);
  const declared = new Set(out.map((o) => o.name));
  const readOnly = new Set<string>();
  for (const match of source.matchAll(new RegExp(`\\b(?:${holder})\\??\\.([A-Za-z_$][\\w$]*)`, 'g'))) {
    const name = match[1] ?? '';
    if (!declared.has(name)) readOnly.add(name);
  }
  return [...out.map((o) => ({ ...o, reads: read(o.name) })), ...[...readOnly].map((name) => ({ name, decl: [], reads: read(name) }))];
}

const GO_FLAG_TYPES = 'String|Bool|Int|Int64|Uint|Uint64|Float64|Duration|Func|BoolFunc';

function goFlags(lines: readonly Line[], source: string, statementEnd: (i: number) => number): OptionFound[] {
  const dashes = /spf13\/(?:pflag|cobra)/.test(source) ? '--' : '-';
  const pointer = new RegExp(`([\\w.]+)\\s*(?::=|=)\\s*[\\w.()]*\\.(?:${GO_FLAG_TYPES})P?\\(\\s*"([^"]+)"`);
  const bound = new RegExp(`\\.(?:${GO_FLAG_TYPES}|Text)?VarP?\\(\\s*&?([\\w.]+)\\s*,\\s*"([^"]+)"`);
  const out: OptionFound[] = [];
  lines.forEach((line, i) => {
    if (!line.start) return;
    const viaPointer = pointer.exec(line.text);
    const viaVar = viaPointer ? null : bound.exec(line.text);
    const match = viaPointer ?? viaVar;
    if (!match) return;
    const bind = match[1] ?? '';
    const escaped = bind.replace(/\./g, '\\.');
    out.push({
      name: `${dashes}${match[2] ?? ''}`,
      decl: [{ from: i, to: statementEnd(i) }],
      reads: viaPointer ? new RegExp(`\\*${escaped}\\b`) : new RegExp(`(?<![\\w.&])${escaped}\\b`),
    });
  });
  return out;
}


function jsonKeys(source: string): Region[] {
  const out: Region[] = [];
  let depth = 0;
  let key: { name: string; from: number } | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '"') {
      const end = skipQuoted(source, i, '"');
      if (depth === 1 && key === null && /^\s*:/.test(source.slice(end + 1, end + 40))) key = { name: source.slice(i + 1, end), from: i };
      i = end;
    } else if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']' || (c === ',' && depth === 1)) {
      if (depth === 1 && key) {
        out.push({ kind: 'config-key', name: key.name, text: source.slice(key.from, i).trimEnd() });
        key = null;
      }
      if (c !== ',') depth -= 1;
    }
  }
  return out;
}

function goModDirectives(source: string): Region[] {
  return splitLines(source).flatMap((text) => {
    const match = /^(module|go|toolchain|godebug)\s+\S/.exec(text);
    return match ? [{ kind: 'config-key' as const, name: match[1] ?? '', text }] : [];
  });
}

const code = (rules: CodeRules) => (source: string): Region[] => {
  const lines = rules.scan(source);
  const statementEnd = rules.block === 'indent' ? (i: number) => pythonStatementEnd(lines, i) : (i: number) => braceStatementEnd(lines, i);
  const blockEnd = rules.block === 'indent' ? (i: number) => pythonBlockEnd(lines, i) : statementEnd;
  const textOf = (from: number, to: number): string => lines.slice(from, to + 1).map((l) => l.text).join('\n');
  const out: Region[] = [];
  const top = (line: Line): boolean => line.start && !line.blank && (rules.block === 'indent' ? line.indent === 0 : line.depth === 0);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !top(line)) continue;
    const head = rules.block === 'indent' ? line.text : line.text.trimStart();
    for (const declaration of rules.declarations) {
      const match = declaration.re.exec(head);
      if (!match) continue;
      const end = blockEnd(i);
      if (declaration.group) {
        for (let j = i + 1; j < end; j += 1) {
          const entry = lines[j];
          const name = entry && entry.start && entry.depth === 1 ? /^\s*([A-Za-z_]\w*)\b/.exec(entry.text)?.[1] : undefined;
          if (!name) continue;
          const to = Math.min(statementEnd(j), end - 1);
          out.push({ kind: declaration.kind, name, text: textOf(j, to) });
          j = to;
        }
        i = end;
        break;
      }
      let from = i;
      while (rules.block === 'indent' && from > 0 && /^@/.test(lines[from - 1]?.text ?? '')) from -= 1;
      const owner = match.groups?.['owner'];
      const name = owner ? `${owner}.${match.groups?.['name']}` : (match.groups?.['name'] ?? '');
      out.push({ kind: declaration.kind, name, text: textOf(from, end) });
      if (declaration.container) out.push(...members(rules, lines, { from: i, to: end }, name, blockEnd, statementEnd));
      i = end;
      break;
    }
  }
  for (const option of rules.options(lines, source, statementEnd)) {
    const own = new Set(option.decl.flatMap((span) => Array.from({ length: span.to - span.from + 1 }, (_, k) => span.from + k)));
    const reads = option.reads;
    const used = reads ? lines.flatMap((l, k) => (!own.has(k) && reads.test(l.text) ? [k] : [])) : [];
    const keep = [...own, ...used].sort((a, b) => a - b);
    if (keep.length > 0) out.push({ kind: 'option', name: option.name, text: keep.map((k) => lines[k]?.text ?? '').join('\n') });
  }
  if (rules.env) {
    const byName = new Map<string, string[]>();
    for (const line of lines) {
      for (const match of line.text.matchAll(rules.env)) {
        const name = match[1] ?? match[2];
        if (name) byName.set(name, [...(byName.get(name) ?? []), line.text]);
      }
    }
    for (const [name, texts] of byName) out.push({ kind: 'config-key', name, text: [...new Set(texts)].join('\n') });
  }
  return out;
};

function members(rules: CodeRules, lines: readonly Line[], span: Span, owner: string, blockEnd: (i: number) => number, statementEnd: (i: number) => number): Region[] {
  const re = rules.member;
  if (!re) return [];
  const header = lines[span.from];
  const bodyFrom = statementEnd(span.from) + 1;
  const bodyIndent = lines.slice(bodyFrom, span.to + 1).find((l) => l.start && !l.blank)?.indent ?? -1;
  const atBody = (line: Line): boolean => (rules.block === 'indent' ? line.indent === bodyIndent : line.depth === (header?.depth ?? 0) + 1);
  const out: Region[] = [];
  for (let j = rules.block === 'indent' ? bodyFrom : span.from + 1; j <= span.to; j += 1) {
    const line = lines[j];
    if (!line || !line.start || line.blank || !atBody(line)) continue;
    const name = re.exec(line.text)?.groups?.['name'];
    if (!name || NOT_MEMBERS.has(name)) continue;
    let from = j;
    while (rules.block === 'indent' && from > bodyFrom && /^\s*@/.test(lines[from - 1]?.text ?? '')) from -= 1;
    const end = Math.min(blockEnd(j), span.to);
    out.push({ kind: 'symbol', name: `${owner}.${name}`, text: lines.slice(from, end + 1).map((l) => l.text).join('\n') });
    j = end;
  }
  return out;
}

const LANGUAGES: readonly Language[] = [
  {
    files: /\.pyw?$/,
    regions: code({
      scan: scanPython,
      block: 'indent',
      declarations: [
        { re: /^(?:async\s+)?def\s+(?<name>\w+)/, kind: 'symbol' },
        { re: /^class\s+(?<name>\w+)/, kind: 'symbol', container: true },
        { re: /^(?<name>[A-Z][A-Z0-9_]*|__\w+__)\s*(?::[^=]*)?=(?!=)/, kind: 'config-key' },
      ],
      member: /^\s*(?:async\s+)?(?:def|class)\s+(?<name>\w+)/,
      options: pythonArgparse,
      env: /(?:os\.environ(?:\.get)?\s*[[(]|os\.getenv\()\s*['"]([A-Za-z_]\w*)['"]/g,
    }),
  },
  {
    files: /\.(?:[cm]?[jt]s|[jt]sx)$/,
    regions: code({
      scan: (source) => scanBraces(source, 'js'),
      block: 'braces',
      declarations: [
        { re: /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\b\s*\*?\s*(?<name>[\w$]+)/, kind: 'symbol' },
        { re: /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: 'symbol', container: true },
        { re: /^(?:export\s+)?(?:declare\s+)?interface\s+(?<name>[\w$]+)/, kind: 'symbol' },
        { re: /^(?:export\s+)?(?:declare\s+)?type\s+(?<name>[\w$]+)\b[^=]*=/, kind: 'symbol' },
        { re: /^(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+(?<name>[\w$]+)/, kind: 'symbol' },
        { re: /^(?:export\s+)?(?:const|let|var)\s+(?<name>[\w$]+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|\(\s*$|[\w$]+\s*=>)/, kind: 'symbol' },
        { re: /^module\.exports\s*=\s*(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: 'symbol' },
        { re: /^(?:module\.)?exports\.(?<name>[\w$]+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/, kind: 'symbol' },
        { re: /^(?<owner>[\w$]+)\.prototype\.(?<name>[\w$]+)\s*=\s*(?:async\s+)?function\b/, kind: 'symbol' },
        { re: /^(?:export\s+)?(?:const|let|var)\s+(?<name>[A-Z][A-Z0-9_]*)\s*(?::[^=]*)?=(?!=)/, kind: 'config-key' },
        { re: /^(?:export\s+)?const\s+(?<name>[\w$]+)\s*(?::[^=]*)?=\s*(?:-?\.?\d|'|"|`|true\b|false\b)/, kind: 'config-key' },
      ],
      member: /^\s*(?:(?:public|private|protected|static|readonly|async|override|abstract|get|set|declare)\s+)*(?<name>#?[\w$]+)\s*(?:<[^>()]*>)?\s*\(/,
      options: scriptOptions,
      env: /process\.env(?:\.([A-Za-z_]\w*)|\[\s*['"]([A-Za-z_]\w*)['"]\s*\])/g,
    }),
  },
  {
    files: /\.go$/,
    regions: code({
      scan: (source) => scanBraces(source, 'go'),
      block: 'braces',
      declarations: [
        { re: /^func\s+(?<name>\w+)/, kind: 'symbol' },
        { re: /^func\s*\(\s*(?:\w+\s+)?\*?\s*(?<owner>\w+)(?:\[[^\]]*\])?\s*\)\s*(?<name>\w+)/, kind: 'symbol' },
        { re: /^type\s*\(/, kind: 'symbol', group: true },
        { re: /^type\s+(?<name>\w+)/, kind: 'symbol' },
        { re: /^const\s*\(/, kind: 'config-key', group: true },
        { re: /^const\s+(?<name>\w+)/, kind: 'config-key' },
      ],
      member: null,
      options: goFlags,
      env: /os\.(?:Getenv|LookupEnv)\(\s*"([A-Za-z_]\w*)"/g,
    }),
  },
  { files: /(?:^|\/)package\.json$/, regions: jsonKeys },
  { files: /(?:^|\/)go\.mod$/, regions: goModDirectives },
];

/** Third-party and generated code: tracked as files, never parsed into items. */
const VENDORED = /(?:^|\/)(?:vendor|node_modules|third_party|Godeps|bower_components)\//;
const GENERATED = /^\s*(?:\/\/|#|\/?\*).*(?:\bcode generated\b|@generated\b|\bdo not edit\b)/im;

const idOf = (region: Region): string => `${region.kind}\u0000${region.name}`;

function regionsOf(path: string, source: string | null): Map<string, Region> {
  const out = new Map<string, Region>();
  if (source === null || VENDORED.test(path) || GENERATED.test(source.slice(0, 600))) return out;
  const language = LANGUAGES.find((l) => l.files.test(path));
  if (!language) return out;
  for (const region of language.regions(source)) {
    const id = idOf(region);
    const known = out.get(id);
    out.set(id, known ? { ...known, text: `${known.text}\n${region.text}` } : region);
  }
  return out;
}

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAX_TEXT = 512 * 1024;
const BATCH = { maxBuffer: 1 << 30 };

type Entry = { readonly status: 'A' | 'D' | 'M'; readonly path: string; readonly blob: string };

function diffsOf(repoDir: string, changes: readonly ChangeRange[]): Map<string, Entry[]> {
  const input = changes.map((c) => (c.before === EMPTY_TREE ? c.after : `${c.after} ${c.before}`)).join('\n');
  const out = git(repoDir, ['diff-tree', '--stdin', '--root', '--always', '-r', '--raw', '--no-renames', '--no-abbrev', '-z'], { input: `${input}\n`, ...BATCH }).stdout as string;
  const byCommit = new Map<string, Entry[]>();
  const tokens = out.split('\0');
  let current: Entry[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = (tokens[i] ?? '').trim();
    if (token.startsWith(':')) {
      const [, , oldBlob = '', newBlob = '', status = 'M'] = token.slice(1).split(' ');
      const path = tokens[i + 1] ?? '';
      i += 1;
      current.push(status === 'D' ? { status, path, blob: oldBlob } : { status: status === 'A' ? 'A' : 'M', path, blob: newBlob });
    } else if (/^[0-9a-f]{40,64}$/.test(token)) {
      current = [];
      byCommit.set(token, current);
    }
  }
  return byCommit;
}

function blobsOf(repoDir: string, shas: ReadonlySet<string>): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (shas.size === 0) return out;
  // latin1 keeps one char per byte, so the sizes in the batch headers are string offsets.
  const raw = git(repoDir, ['cat-file', '--batch'], { input: `${[...shas].join('\n')}\n`, encoding: 'latin1', ...BATCH }).stdout;
  let at = 0;
  while (at < raw.length) {
    const eol = raw.indexOf('\n', at);
    if (eol === -1) break;
    const [sha = '', type, size] = raw.slice(at, eol).split(' ');
    at = eol + 1;
    if (type === 'missing' || size === undefined) {
      out.set(sha, null);
      continue;
    }
    const length = Number(size);
    const body = raw.slice(at, at + length);
    at += length + 1;
    out.set(sha, length > MAX_TEXT || body.includes('\0') ? null : Buffer.from(body, 'latin1').toString('utf8'));
  }
  return out;
}

// Punctuation and layout never make two texts alike.
const TOKEN = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;

function tokensOf(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

const regionTokens = new WeakMap<Region, string[]>();

function tokensOfRegion(region: Region): string[] {
  let tokens = regionTokens.get(region);
  if (!tokens) {
    tokens = tokensOf(region.text);
    regionTokens.set(region, tokens);
  }
  return tokens;
}

function dice(a: readonly string[], b: readonly string[]): number {
  if (a.length + b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  let shared = 0;
  for (const t of b) {
    const n = counts.get(t) ?? 0;
    if (n > 0) {
      shared += 1;
      counts.set(t, n - 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

function significant(text: string): string[] {
  return splitLines(text).map((line) => line.trim().replace(/\s+/g, ' ')).filter((line) => /[A-Za-z0-9]/.test(line));
}

function without(lines: readonly string[], drop: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of drop) counts.set(line, (counts.get(line) ?? 0) + 1);
  return lines.filter((line) => {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    return n === 0;
  });
}

const leafOf = (name: string): string => name.slice(name.lastIndexOf('.') + 1);

function rename(text: string, from: string, to: string): string {
  const old = leafOf(from);
  return /^[\w$]+$/.test(old) ? text.replace(new RegExp(`(?<![\\w$])${old.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'), leafOf(to)) : text.split(old).join(leafOf(to));
}

/** Lines weigh by their tokens, so a short line like `continue` cannot carry a match on its own. */
function drawnFrom(target: readonly string[], pool: ReadonlyArray<{ readonly owner: string; readonly line: string }>): { readonly score: number; readonly mass: number; readonly owner: string | null } {
  const candidates = pool.map((p) => ({ owner: p.owner, tokens: tokensOf(p.line) }));
  const byOwner = new Map<string, number>();
  let drawn = 0;
  let weight = 0;
  for (const line of target) {
    const tokens = tokensOf(line);
    let best: { score: number; owner: string } | null = null;
    for (const candidate of candidates) {
      const score = dice(tokens, candidate.tokens);
      if (!best || score > best.score) best = { score, owner: candidate.owner };
    }
    weight += tokens.length;
    if (!best) continue;
    drawn += best.score * tokens.length;
    byOwner.set(best.owner, (byOwner.get(best.owner) ?? 0) + best.score * tokens.length);
  }
  const owner = [...byOwner].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { score: weight === 0 ? 0 : drawn / weight, mass: drawn, owner };
}

type Live = { readonly item: Item; region: Region };
type Tracked = { readonly item: Item; readonly text: string | null; readonly regions: Map<string, Live> };
type Next = { readonly text: string | null; readonly regions: Map<string, Live>; source: string | null };
type Gone = { readonly live: Live; readonly path: string; readonly size: number; taken: boolean; to: string | null };
type Appeared = { readonly region: Region; readonly path: string; readonly into: Next; taken: boolean };
type Shrunk = { readonly name: string; readonly lost: readonly string[] };

const goneOf = (live: Live, path: string): Gone => ({ live, path, size: significant(live.region.text).length, taken: false, to: null });

function carry(change: ChangeId, live: Live, region: Region, from: string, to: string): void {
  const was = live.region;
  const hop: Hop | null =
    was.name !== region.name ? { change, kind: 'renamed', from: was.name, matchedBy: 'text' }
    : from !== to ? { change, kind: 'moved', from, matchedBy: 'text' }
    : was.text !== region.text ? { change, kind: 'changed', matchedBy: 'name' }
    : null;
  if (hop) live.item.hops.push(hop);
  if (was.name !== region.name && !live.item.formerNames.includes(was.name)) live.item.formerNames.push(was.name);
  live.item.name = region.name;
  live.item.path = to;
  live.region = region;
}

function bestPairs<G, A>(gone: readonly G[], appeared: readonly A[], score: (g: G, a: A) => number | null): Array<[G, A]> {
  const scored: Array<[number, G, A]> = [];
  for (const g of gone) {
    for (const a of appeared) {
      const s = score(g, a);
      if (s !== null) scored.push([s, g, a]);
    }
  }
  scored.sort((x, y) => y[0] - x[0]);
  const usedG = new Set<G>();
  const usedA = new Set<A>();
  const out: Array<[G, A]> = [];
  for (const [, g, a] of scored) {
    if (usedG.has(g) || usedA.has(a)) continue;
    usedG.add(g);
    usedA.add(a);
    out.push([g, a]);
  }
  return out;
}

export function deriveItems(repoDir: string, changes: readonly ChangeRange[]): Item[] {
  const diffs = diffsOf(repoDir, changes);
  const blobs = blobsOf(repoDir, new Set([...diffs.values()].flatMap((entries) => entries.filter((e) => e.status !== 'D').map((e) => e.blob))));
  const items: Item[] = [];
  const files = new Map<string, Tracked>();
  for (const change of changes) step(change.id, diffs.get(change.after) ?? [], files, (blob) => blobs.get(blob) ?? null, items);
  return items;
}

function step(change: ChangeId, entries: readonly Entry[], files: Map<string, Tracked>, textOf: (blob: string) => string | null, items: Item[]): void {
  const created = (kind: ItemKind, name: string, path: string, hop: Hop): Item => {
    const item: Item = { kind, name, path, formerNames: [], hops: [hop] };
    items.push(item);
    return item;
  };
  const olds = new Map<string, Tracked>();
  const news = new Map<string, Next>();
  const deleted: string[] = [];
  const added: Array<{ readonly path: string; readonly text: string | null }> = [];
  for (const e of entries) {
    const before = files.get(e.path);
    if (before) olds.set(e.path, before);
    if (e.status === 'D' && before) deleted.push(e.path);
    else if (e.status === 'M' && before) news.set(e.path, { text: textOf(e.blob), regions: new Map(), source: e.path });
    else if (e.status !== 'D') added.push({ path: e.path, text: textOf(e.blob) });
  }
  for (const [from, to] of pairFiles(deleted.map((path) => ({ path, text: olds.get(path)?.text ?? null })), added)) news.set(to, { text: added.find((a) => a.path === to)?.text ?? null, regions: new Map(), source: from });
  for (const a of added) if (!news.has(a.path)) news.set(a.path, { text: a.text, regions: new Map(), source: null });

  const gone: Gone[] = [];
  const appeared: Appeared[] = [];
  const shrunk: Shrunk[] = [];
  const continued = new Set<string>();
  for (const [path, next] of news) {
    const before = next.source === null ? undefined : olds.get(next.source);
    if (next.source !== null) continued.add(next.source);
    const regions = regionsOf(path, next.text);
    for (const [id, region] of regions) {
      const live = before?.regions.get(id);
      if (!live || next.source === null) {
        appeared.push({ region, path, into: next, taken: false });
        continue;
      }
      const lost = without(significant(live.region.text), significant(region.text));
      if (lost.length > 0) shrunk.push({ name: live.region.name, lost });
      carry(change, live, region, next.source, path);
      next.regions.set(id, live);
    }
    for (const [id, live] of before?.regions ?? []) if (!regions.has(id) && next.source !== null) gone.push(goneOf(live, next.source));
  }
  for (const [path, before] of olds) if (!continued.has(path)) for (const live of before.regions.values()) gone.push(goneOf(live, path));

  const take = (g: Gone, a: Appeared): void => {
    g.taken = true;
    g.to = a.path;
    a.taken = true;
    carry(change, g.live, a.region, g.path, a.path);
    a.into.regions.set(idOf(a.region), g.live);
  };
  const open = <T extends { taken: boolean }>(list: readonly T[]): T[] => list.filter((x) => !x.taken);
  const holders = new Map<string, number>();
  for (const id of [...gone.map((g) => idOf(g.live.region)), ...appeared.map((a) => idOf(a.region))]) holders.set(id, (holders.get(id) ?? 0) + 1);
  const sameId = (g: Gone, a: Appeared): number | null => {
    const id = idOf(a.region);
    if (idOf(g.live.region) !== id) return null;
    const score = dice(tokensOfRegion(g.live.region), tokensOfRegion(a.region));
    return score >= MOVE_MIN || holders.get(id) === 2 ? score : null;
  };
  for (const [g, a] of bestPairs(gone, appeared, sameId)) take(g, a);
  const swaps = referenceSwaps([...news.values()].flatMap((next) => (next.source === null ? [] : [[olds.get(next.source)?.text ?? null, next.text] as const])));
  for (const [g, a] of bestPairs(open(gone), open(appeared), (g, a) => renameScore(g.live.region, a.region, swaps))) take(g, a);
  for (const [from, to] of followItems(deleted.filter((path) => !continued.has(path)), gone, news)) {
    const next = news.get(to);
    if (next) next.source = from;
    continued.add(from);
  }

  const seen = new Map<string, number>();
  for (const text of [...[...olds.values()].map((t) => t.text), ...[...news.values()].map((n) => n.text)]) for (const line of significant(text ?? '')) seen.set(line, (seen.get(line) ?? 0) + 1);
  const telling = (line: string): boolean => (seen.get(line) ?? 0) < BOILERPLATE;
  const pool = [...open(gone).map((g) => ({ name: g.live.region.name, lost: significant(g.live.region.text) })), ...shrunk].flatMap((source) => source.lost.filter(telling).map((line) => ({ owner: source.name, line })));
  for (const a of open(appeared)) {
    const drawn = drawnFrom(significant(a.region.text).filter(telling), pool);
    const hop: Hop = drawn.owner !== null && drawn.score >= EXTRACT_MIN && drawn.mass >= EXTRACT_MIN_TOKENS ? { change, kind: 'extracted-from', from: drawn.owner, matchedBy: 'text' } : { change, kind: 'introduced', matchedBy: 'name' };
    a.into.regions.set(idOf(a.region), { item: created(a.region.kind, a.region.name, a.path, hop), region: a.region });
  }
  for (const g of open(gone)) {
    g.live.item.hops.push({ change, kind: 'removed', matchedBy: 'name' });
    g.live.item.path = null;
  }

  for (const [path, before] of olds) {
    if (continued.has(path)) continue;
    before.item.hops.push({ change, kind: 'removed', matchedBy: 'name' });
    before.item.path = null;
  }
  for (const path of olds.keys()) files.delete(path);
  for (const [path, next] of news) {
    const before = next.source === null ? undefined : olds.get(next.source);
    let item: Item;
    if (!before || next.source === null) item = created('file', path, path, { change, kind: 'introduced', matchedBy: 'name' });
    else {
      item = before.item;
      if (next.source === path) item.hops.push({ change, kind: 'changed', matchedBy: 'name' });
      else {
        item.hops.push({ change, kind: 'moved', from: next.source, matchedBy: 'text' });
        if (!item.formerNames.includes(next.source)) item.formerNames.push(next.source);
        item.name = path;
        item.path = path;
      }
    }
    files.set(path, { item, text: next.text, regions: next.regions });
  }
}

/** A deleted file continues as the new file that took most of its items, so its history survives a rewrite. */
function followItems(deleted: readonly string[], gone: readonly Gone[], news: ReadonlyMap<string, Next>): Array<[string, string]> {
  const mass = (from: string, to?: string): number => gone.reduce((sum, g) => sum + (g.path === from && (to === undefined || g.to === to) ? g.size : 0), 0);
  return bestPairs(deleted, [...news.keys()].filter((path) => news.get(path)?.source === null), (from, to) => {
    const total = mass(from);
    const share = total === 0 ? 0 : mass(from, to) / total;
    return share >= FOLLOW_MIN ? share : null;
  });
}

const MOVE_MIN = 0.5;
const FOLLOW_MIN = 0.5;
const EXTRACT_MIN = 0.5;
const EXTRACT_MIN_TOKENS = 12;
/** A line this common across one change's texts (if err != nil {, return nil, err) says nothing about where code came from. */
const BOILERPLATE = 3;
const RENAME_MIN = 0.6;
const RENAME_WITH_EVIDENCE_MIN = 0.2;
const COMMON_LINE_FILES = 6;

type Swaps = { readonly removed: readonly string[]; readonly added: ReadonlySet<string> };

function referenceSwaps(pairs: ReadonlyArray<readonly [string | null, string | null]>): Swaps {
  const removed: string[] = [];
  const added = new Set<string>();
  for (const [before, after] of pairs) {
    const was = significant(before ?? '');
    const now = significant(after ?? '');
    removed.push(...without(was, now));
    for (const line of without(now, was)) added.add(line);
  }
  return { removed, added };
}

function renameScore(was: Region, now: Region, swaps: Swaps): number | null {
  if (was.kind !== now.kind || was.name === now.name) return null;
  const from = leafOf(was.name);
  const to = leafOf(now.name);
  const renamed = tokensOfRegion(was).map((t) => (t === from ? to : /^[\w$]+$/.test(from) ? t : t.split(from).join(to)));
  const score = dice(renamed, tokensOfRegion(now));
  if (score >= RENAME_MIN) return score;
  if (score < RENAME_WITH_EVIDENCE_MIN) return null;
  return swaps.removed.some((line) => line.includes(from) && swaps.added.has(rename(line, was.name, now.name)) && !was.text.includes(line)) ? score : null;
}

type FileText = { readonly path: string; readonly text: string | null };

/** Only pairs that share an uncommon line are scored, so a vendored tree moving wholesale stays linear. */
function pairFiles(deleted: readonly FileText[], added: readonly FileText[]): Array<[string, string]> {
  const holders = new Map<string, FileText[]>();
  for (const file of [...deleted, ...added]) for (const line of new Set(significant(file.text ?? ''))) holders.set(line, [...(holders.get(line) ?? []), file]);
  const key = (d: FileText, a: FileText): string => `${d.path}\u0000${a.path}`;
  const candidates = new Set<string>();
  for (const files of holders.values()) {
    if (files.length > COMMON_LINE_FILES) continue;
    for (const d of files) if (deleted.includes(d)) for (const a of files) if (added.includes(a)) candidates.add(key(d, a));
  }
  const tokens = new Map<FileText, string[]>();
  const tokensOfFile = (file: FileText): string[] => tokens.get(file) ?? tokens.set(file, tokensOf(file.text ?? '')).get(file) ?? [];
  return bestPairs(deleted, added, (d, a) => {
    if (d.text === null || a.text === null) return null;
    if (d.text === a.text) return 1;
    if (!candidates.has(key(d, a))) return null;
    const score = dice(tokensOfFile(d), tokensOfFile(a));
    return score >= MOVE_MIN ? score : null;
  }).map(([d, a]) => [d.path, a.path]);
}
