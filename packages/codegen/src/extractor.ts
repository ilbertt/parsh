import { readFile } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import type { ExtractedCommand, SourceSegment } from '#types.ts';

/**
 * Parse a path string like `users [id] edit` into segments.
 * Bracket tokens `[name]` are dynamic params; other space-separated tokens are literals.
 */
export function parsePathString(pathString: string): SourceSegment[] {
  const tokens = pathString.trim().split(/\s+/).filter(Boolean);
  const segments: SourceSegment[] = [];
  for (const tok of tokens) {
    if (tok.startsWith('[') && tok.endsWith(']')) {
      segments.push({ kind: 'param', name: tok.slice(1, -1) });
    } else {
      segments.push({ kind: 'literal', value: tok });
    }
  }
  return segments;
}

function segmentsEqual(opts: { a: SourceSegment[]; b: SourceSegment[] }): boolean {
  if (opts.a.length !== opts.b.length) {
    return false;
  }
  for (let i = 0; i < opts.a.length; i++) {
    const x = opts.a[i]!;
    const y = opts.b[i]!;
    if (x.kind !== y.kind) {
      return false;
    }
    if (x.kind === 'literal' && y.kind === 'literal' && x.value !== y.value) {
      return false;
    }
    if (x.kind === 'param' && y.kind === 'param' && x.name !== y.name) {
      return false;
    }
  }
  return true;
}

/**
 * Extract the path string from `defineCommand('...', { ... })` and the `args` /
 * `params` keys from top-level `export const args = {...}` / `export const params = {...}`.
 *
 * Convention: command files MUST declare `args` (and `params`, when the path has
 * dynamic segments) as standalone named exports. This keeps `typeof args` resolvable
 * by tsc without routing through the command's own type — which would be circular,
 * because the generated `CommandRegistry` entry feeds back into `HandlerCtx`.
 */
function extractFromSource(opts: { source: string; filePath: string }): {
  pathString: string;
  argNames: string[];
  paramNames: string[];
} {
  const src = opts.source;
  const callMatch = src.match(/defineCommand\s*\(\s*(['"])([^'"]+)\1\s*,/);
  if (!callMatch) {
    throw new Error(`parsh: ${opts.filePath} does not contain a defineCommand('...', ...) call`);
  }
  const pathString = callMatch[2]!;
  const hasArgsExport = /export\s+const\s+args\s*=/.test(src);
  if (!hasArgsExport) {
    throw new Error(
      `parsh: ${opts.filePath} must export a top-level \`const args = {...}\` and pass it to defineCommand.`,
    );
  }
  return {
    pathString,
    argNames: extractKeysOfExport({ source: src, exportName: 'args' }),
    paramNames: extractKeysOfExport({ source: src, exportName: 'params' }),
  };
}

/**
 * Scan forward from `start` (which must be one past an opening `{`) and return
 * the substring up to the matching closing `}`. Nested braces are tracked.
 */
function readBalancedBraceBody(opts: { source: string; start: number }): string {
  let depth = 1;
  let i = opts.start;
  const len = opts.source.length;
  const body: string[] = [];
  while (i < len && depth > 0) {
    const ch = opts.source[i]!;
    if (ch === '{') {
      depth++;
      body.push(ch);
    } else if (ch === '}') {
      depth--;
      if (depth > 0) {
        body.push(ch);
      }
    } else {
      body.push(ch);
    }
    i++;
  }
  return body.join('');
}

/**
 * Collect the top-level key names from an object-literal body, ignoring keys
 * that appear inside nested `(...)`, `[...]`, or `{...}` (which would be values).
 */
function topLevelObjectKeys(body: string): string[] {
  const topLevel = stripBalanced(body);
  const keyRe = /(^|[,{])\s*(?:(['"])([^'"]+)\2|([A-Za-z_$][\w$]*))\s*:/g;
  const keys: string[] = [];
  let km = keyRe.exec(topLevel);
  while (km !== null) {
    const key = km[3] ?? km[4];
    if (key) {
      keys.push(key);
    }
    km = keyRe.exec(topLevel);
  }
  return keys;
}

/**
 * Extract the top-level key names from `export const <exportName> = { key1: ..., ... }`.
 * Returns [] if the export is absent or the object is empty.
 */
function extractKeysOfExport(opts: { source: string; exportName: string }): string[] {
  const re = new RegExp(`export\\s+const\\s+${opts.exportName}\\s*=\\s*\\{`);
  const m = opts.source.match(re);
  if (!m) {
    return [];
  }
  const body = readBalancedBraceBody({
    source: opts.source,
    start: m.index! + m[0].length,
  });
  return topLevelObjectKeys(body);
}

function stripBalanced(src: string): string {
  const out: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (ch === '\\' && i + 1 < src.length) {
        i++;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      if (depth === 0) {
        out.push(' ');
      }
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth === 0) {
      out.push(ch);
    }
  }
  return out.join('');
}

/**
 * Build a stable camelCase identifier from the relative command path.
 * `/.../commands/users/[id]/edit.ts` → `usersIdEditCmd`
 */
function importNameFor(opts: { filePath: string }): string {
  const noExt = opts.filePath.replace(/\.ts$/, '');
  const parts = noExt.split('/');
  const ix = parts.lastIndexOf('commands');
  const subpath = ix >= 0 ? parts.slice(ix + 1) : [basename(noExt)];
  const stripped = subpath
    .map((p) => p.replace(/^\[(.+)\]$/, '$1'))
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ''));
  let camel = '';
  for (let i = 0; i < stripped.length; i++) {
    const piece = stripped[i]!;
    camel += i === 0 ? piece : piece.charAt(0).toUpperCase() + piece.slice(1);
  }
  return `${camel}Cmd`;
}

export async function extractCommand(opts: {
  filePath: string;
  expectedSegments: SourceSegment[];
  outDir: string;
}): Promise<ExtractedCommand> {
  const source = await readFile(opts.filePath, 'utf8');
  const { pathString, argNames, paramNames } = extractFromSource({
    source,
    filePath: opts.filePath,
  });
  const segments = parsePathString(pathString);
  if (!segmentsEqual({ a: segments, b: opts.expectedSegments })) {
    const got = pathString;
    const want = opts.expectedSegments
      .map((s) => (s.kind === 'literal' ? s.value : `[${s.name}]`))
      .join(' ');
    throw new Error(
      `parsh: ${opts.filePath} — defineCommand path string '${got}' does not match its filesystem location '${want}'`,
    );
  }
  let spec = relative(opts.outDir, opts.filePath);
  if (!spec.startsWith('.')) {
    spec = `./${spec}`;
  }
  return {
    filePath: opts.filePath,
    pathString,
    segments,
    argNames,
    paramNames,
    importName: importNameFor({ filePath: opts.filePath }),
    importSpecifier: spec,
  };
}
