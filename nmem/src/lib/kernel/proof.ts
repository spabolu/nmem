/**
 * Frozen copy of the proof grammar in the lab's fixtures/lib/checks.mjs: parse and format only. The app never runs a
 * proof. It shows the output the lab baked into site.json.
 */
import type { Proof, Rev } from "./contract";

export const MAX_RUN_SOURCE_BYTES = 64 * 1024;

const REV = /^[A-Za-z0-9_][A-Za-z0-9_./^~-]*$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GREP_FLAGS = ["i", "E"] as const;

type Token = { readonly value: string; readonly quoted: boolean };

function tokenize(raw: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === " ") {
      i += 1;
      continue;
    }
    if (raw[i] === '"') {
      let j = i + 1;
      while (j < raw.length && raw[j] !== '"') j += raw[j] === "\\" ? 2 : 1;
      if (j >= raw.length) return null;
      let value: unknown;
      try {
        value = JSON.parse(raw.slice(i, j + 1));
      } catch {
        return null;
      }
      i = j + 1;
      if (i < raw.length && raw[i] !== " ") return null;
      tokens.push({ value: value as string, quoted: true });
      continue;
    }
    let j = i;
    while (j < raw.length && raw[j] !== " ") j += 1;
    const value = raw.slice(i, j);
    if (/["\s]/.test(value)) return null;
    tokens.push({ value, quoted: false });
    i = j;
  }
  return tokens;
}

function word(value: string): string {
  return value === "" || /[\s"]/.test(value) || value.startsWith("-")
    ? JSON.stringify(value)
    : value;
}

function isRev(value: string): boolean {
  return REV.test(value) && !value.includes("..");
}

function bare(token: Token | undefined): string | null {
  return token && !token.quoted ? token.value : null;
}

function revRange(token: Token | undefined): { from: Rev; to: Rev } | null {
  const value = bare(token);
  if (value === null) return null;
  const parts = value.split("..");
  if (parts.length !== 2 || !isRev(parts[0] ?? "") || !isRev(parts[1] ?? ""))
    return null;
  return { from: parts[0] as Rev, to: parts[1] as Rev };
}

function operand(token: Token | undefined): string | null {
  if (!token || token.value === "") return null;
  if (!token.quoted && token.value.startsWith("-")) return null;
  return token.value;
}

type Verb = Proof["verb"];
type Grammar = {
  readonly [V in Verb]: {
    readonly parse: (args: readonly Token[]) => Proof | null;
    readonly format: (proof: Extract<Proof, { verb: V }>) => string;
  };
};

const PROOFS: Grammar = {
  grep: {
    parse(args) {
      const rev = bare(args[0]);
      if (rev === null || !isRev(rev)) return null;
      const flags: string[] = [];
      let k = 1;
      while (
        k < args.length &&
        !args[k]?.quoted &&
        /^-[iE]$/.test(args[k]?.value ?? "")
      ) {
        const flag = (args[k]?.value ?? "").slice(1);
        if (flags.includes(flag)) return null;
        flags.push(flag);
        k += 1;
      }
      const pattern = operand(args[k]);
      if (pattern === null) return null;
      k += 1;
      let paths: string[] = [];
      if (k < args.length) {
        if (bare(args[k]) !== "--" || k + 1 >= args.length) return null;
        paths = args.slice(k + 1).map((t) => t.value);
        if (paths.some((p) => p === "")) return null;
      }
      return {
        verb: "grep",
        rev: rev as Rev,
        pattern,
        flags: GREP_FLAGS.filter((f) => flags.includes(f)),
        paths,
      };
    },
    format(p) {
      const paths = p.paths.length ? ["--", ...p.paths.map(word)] : [];
      return [
        "grep",
        p.rev,
        ...p.flags.map((f) => `-${f}`),
        word(p.pattern),
        ...paths,
      ].join(" ");
    },
  },
  files: {
    parse(args) {
      if (args.length !== 1) return null;
      const range = revRange(args[0]);
      if (range) return { verb: "files", from: range.from, to: range.to };
      const rev = bare(args[0]);
      return rev !== null && isRev(rev)
        ? { verb: "files", from: null, to: rev as Rev }
        : null;
    },
    format: (p) =>
      p.from === null ? `files ${p.to}` : `files ${p.from}..${p.to}`,
  },
  diff: {
    parse(args) {
      const range = args.length === 1 ? revRange(args[0]) : null;
      return range ? { verb: "diff", ...range } : null;
    },
    format: (p) => `diff ${p.from}..${p.to}`,
  },
  restyle: {
    parse(args) {
      if (args.length === 2) {
        const head = bare(args[0]);
        const range =
          head?.endsWith(":") && args[1]?.quoted
            ? revRange({ value: head.slice(0, -1), quoted: false })
            : null;
        return range && args[1]
          ? { verb: "restyle", ...range, path: args[1].value }
          : null;
      }
      const value = args.length === 1 ? bare(args[0]) : null;
      const colon = value === null ? -1 : value.indexOf(":");
      if (value === null || colon < 1 || colon === value.length - 1)
        return null;
      const range = revRange({ value: value.slice(0, colon), quoted: false });
      return range
        ? { verb: "restyle", ...range, path: value.slice(colon + 1) }
        : null;
    },
    format: (p) =>
      !/[\s"]/.test(p.path)
        ? `restyle ${p.from}..${p.to}:${p.path}`
        : `restyle ${p.from}..${p.to}: ${JSON.stringify(p.path)}`,
  },
  lockfile: {
    parse(args) {
      const range = args.length === 1 ? revRange(args[0]) : null;
      return range ? { verb: "lockfile", ...range } : null;
    },
    format: (p) => `lockfile ${p.from}..${p.to}`,
  },
  introduced: {
    parse(args) {
      if (args.length !== 2) return null;
      const file = operand(args[0]);
      const needle = operand(args[1]);
      return file === null || needle === null
        ? null
        : { verb: "introduced", path: file, needle };
    },
    format: (p) => `introduced ${word(p.path)} ${word(p.needle)}`,
  },
  run: {
    parse(args) {
      const id = args.length === 1 ? bare(args[0]) : null;
      return id !== null && RUN_ID.test(id) ? { verb: "run", id } : null;
    },
    format: (p) => `run ${p.id}`,
  },
};

export function parseProof(raw: string): Proof | null {
  if (typeof raw !== "string") return null;
  const parsed = tokenize(raw);
  const head = parsed?.[0];
  if (!parsed || !head || head.quoted || !Object.hasOwn(PROOFS, head.value))
    return null;
  return PROOFS[head.value as Verb].parse(parsed.slice(1));
}

export function formatProof(proof: Proof): string {
  return (PROOFS[proof.verb].format as (p: Proof) => string)(proof);
}
