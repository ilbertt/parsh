import { readFile } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import ts from 'typescript';
import type { ExtractedCommand, SourceSegment } from './types.js';

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

function parseSourceFile({
  source,
  filePath,
}: {
  source: string;
  filePath: string;
}): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, /* setParentNodes */ true);
}

function findDefineCall({
  sourceFile,
  name,
}: {
  sourceFile: ts.SourceFile;
  name: 'defineCommand' | 'defineRootCommand';
}): ts.CallExpression | null {
  let found: ts.CallExpression | null = null;
  function visit(node: ts.Node) {
    if (found) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function importNameFor({ filePath }: { filePath: string }): string {
  const noExt = filePath.replace(/\.ts$/, '');
  const parts = noExt.split(/[/\\]/);
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

function importSpecifierFor({ outDir, filePath }: { outDir: string; filePath: string }): string {
  let spec = relative(outDir, filePath).replaceAll('\\', '/');
  if (!spec.startsWith('.')) {
    spec = `./${spec}`;
  }
  return spec;
}

export async function extractRootCommand({
  filePath,
  outDir,
}: {
  filePath: string;
  outDir: string;
}): Promise<ExtractedCommand> {
  const source = await readFile(filePath, 'utf8');
  const sourceFile = parseSourceFile({ source, filePath });
  const call = findDefineCall({ sourceFile, name: 'defineRootCommand' });
  if (!call) {
    throw new Error(`parsh: ${filePath} does not contain a defineRootCommand({ ... }) call`);
  }
  return {
    filePath,
    pathString: '',
    segments: [],
    importName: 'rootCmd',
    importSpecifier: importSpecifierFor({ outDir, filePath }),
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
  const sourceFile = parseSourceFile({ source, filePath });
  const call = findDefineCall({ sourceFile, name: 'defineCommand' });
  if (!call || call.arguments.length < 1) {
    throw new Error(`parsh: ${filePath} does not contain a defineCommand('...', ...) call`);
  }
  const pathArg = call.arguments[0];
  if (!pathArg || !ts.isStringLiteralLike(pathArg)) {
    throw new Error(
      `parsh: ${filePath} — defineCommand path (first argument) must be a string literal`,
    );
  }
  const pathString = pathArg.text;
  const segments = parsePathString(pathString);
  if (!segmentsEqual({ a: segments, b: expectedSegments })) {
    const want = expectedSegments
      .map((s) => (s.kind === 'literal' ? s.value : `[${s.name}]`))
      .join(' ');
    throw new Error(
      `parsh: ${filePath} — defineCommand path string '${pathString}' does not match its filesystem location '${want}'`,
    );
  }
  return {
    filePath,
    pathString,
    segments,
    importName: importNameFor({ filePath }),
    importSpecifier: importSpecifierFor({ outDir, filePath }),
  };
}
