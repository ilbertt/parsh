import { readFile } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import type { ExtractedCommand, ExtractedOption, SourceSegment } from '#types.ts';

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
  options: ExtractedOption[];
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
    options: extractOptions(defBody),
    paramNames: extractInlineObjectKeys({ body: defBody, prop: 'params' }).map((e) => e.key),
  };
}

function extractOptions(body: string): ExtractedOption[] {
  return extractInlineObjectKeys({ body, prop: 'options' }).map(({ key, value }) => ({
    name: key,
    type: /\bboolean\s*\(/.test(value) ? 'boolean' : 'string',
  }));
}

interface ObjectEntry {
  key: string;
  value: string;
}

function extractInlineObjectKeys({ body, prop }: { body: string; prop: string }): ObjectEntry[] {
  const re = new RegExp(`(^|[\\s,;{])${prop}\\s*:\\s*\\{`);
  const m = body.match(re);
  if (!m) {
    return [];
  }
  const inner = readBalancedBraceBody({
    source: body,
    start: m.index! + m[0].length,
  });
  return topLevelObjectEntries(inner);
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

/**
 * Return each top-level `key: value` pair inside an object literal body.
 * Tracks nested brackets and string literals so commas inside values don't
 * split a single entry.
 */
function topLevelObjectEntries(body: string): ObjectEntry[] {
  const out: ObjectEntry[] = [];
  const len = body.length;
  let i = 0;
  let depth = 0;
  let inStr: string | null = null;

  const skipWhitespace = (): void => {
    while (i < len && /\s/.test(body[i]!)) {
      i++;
    }
  };

  while (i < len) {
    skipWhitespace();
    if (i >= len) {
      break;
    }

    const keyMatch = /^(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*:/.exec(body.slice(i));
    if (!keyMatch) {
      i++;
      continue;
    }
    const key = keyMatch[2] ?? keyMatch[3]!;
    i += keyMatch[0].length;

    const valueStart = i;
    depth = 0;
    inStr = null;
    while (i < len) {
      const ch = body[i]!;
      if (inStr) {
        if (ch === '\\' && i + 1 < len) {
          i += 2;
          continue;
        }
        if (ch === inStr) {
          inStr = null;
        }
        i++;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inStr = ch;
        i++;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
        i++;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) {
          break;
        }
        depth--;
        i++;
        continue;
      }
      if (ch === ',' && depth === 0) {
        break;
      }
      i++;
    }
    out.push({ key, value: body.slice(valueStart, i).trim() });
    if (body[i] === ',') {
      i++;
    }
  }

  return out;
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
  const options = extractOptions(defBody);
  let spec = relative(outDir, filePath);
  if (!spec.startsWith('.')) {
    spec = `./${spec}`;
  }
  return {
    filePath,
    pathString: '',
    segments: [],
    options,
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
  const { pathString, options, paramNames } = extractFromSource({ source, filePath });
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
    options,
    paramNames,
    importName: importNameFor({ filePath }),
    importSpecifier: spec,
  };
}
