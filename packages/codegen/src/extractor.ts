import { readFile } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import type { ExtractedCommand, SourceSegment } from '#types.ts';

function parsePathString(pathString: string): SourceSegment[] {
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

function segmentsEqual({ a, b }: { a: SourceSegment[]; b: SourceSegment[] }): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
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

function extractFromSource({ source, filePath }: { source: string; filePath: string }): {
  pathString: string;
  optionNames: string[];
  paramNames: string[];
} {
  const callMatch = source.match(/defineCommand\s*\(\s*(['"])([^'"]+)\1\s*,\s*\{/);
  if (!callMatch) {
    throw new Error(`parsh: ${filePath} does not contain a defineCommand('...', { ... }) call`);
  }
  const pathString = callMatch[2]!;
  const defBody = readBalancedBraceBody({
    source,
    start: callMatch.index! + callMatch[0].length,
  });
  return {
    pathString,
    optionNames: extractInlineObjectKeys({ body: defBody, prop: 'options' }),
    paramNames: extractInlineObjectKeys({ body: defBody, prop: 'params' }),
  };
}

function extractInlineObjectKeys({ body, prop }: { body: string; prop: string }): string[] {
  const re = new RegExp(`(^|[\\s,;{])${prop}\\s*:\\s*\\{`);
  const m = body.match(re);
  if (!m) {
    return [];
  }
  const inner = readBalancedBraceBody({
    source: body,
    start: m.index! + m[0].length,
  });
  return topLevelObjectKeys(inner);
}

function readBalancedBraceBody({ source, start }: { source: string; start: number }): string {
  let depth = 1;
  let i = start;
  const len = source.length;
  const body: string[] = [];
  while (i < len && depth > 0) {
    const ch = source[i]!;
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

function importNameFor({ filePath }: { filePath: string }): string {
  const noExt = filePath.replace(/\.ts$/, '');
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

export async function extractRootCommand({
  filePath,
  outDir,
}: {
  filePath: string;
  outDir: string;
}): Promise<ExtractedCommand> {
  const source = await readFile(filePath, 'utf8');
  const callMatch = source.match(/defineRootCommand\s*\(\s*\{/);
  if (!callMatch) {
    throw new Error(`parsh: ${filePath} does not contain a defineRootCommand({ ... }) call`);
  }
  const defBody = readBalancedBraceBody({
    source,
    start: callMatch.index! + callMatch[0].length,
  });
  const optionNames = extractInlineObjectKeys({ body: defBody, prop: 'options' });
  let spec = relative(outDir, filePath);
  if (!spec.startsWith('.')) {
    spec = `./${spec}`;
  }
  return {
    filePath,
    pathString: '',
    segments: [],
    optionNames,
    paramNames: [],
    importName: 'rootCmd',
    importSpecifier: spec,
  };
}

export async function extractCommand({
  filePath,
  expectedSegments,
  outDir,
}: {
  filePath: string;
  expectedSegments: SourceSegment[];
  outDir: string;
}): Promise<ExtractedCommand> {
  const source = await readFile(filePath, 'utf8');
  const { pathString, optionNames, paramNames } = extractFromSource({ source, filePath });
  const segments = parsePathString(pathString);
  if (!segmentsEqual({ a: segments, b: expectedSegments })) {
    const want = expectedSegments
      .map((s) => (s.kind === 'literal' ? s.value : `[${s.name}]`))
      .join(' ');
    throw new Error(
      `parsh: ${filePath} — defineCommand path string '${pathString}' does not match its filesystem location '${want}'`,
    );
  }
  let spec = relative(outDir, filePath);
  if (!spec.startsWith('.')) {
    spec = `./${spec}`;
  }
  return {
    filePath,
    pathString,
    segments,
    optionNames,
    paramNames,
    importName: importNameFor({ filePath }),
    importSpecifier: spec,
  };
}
