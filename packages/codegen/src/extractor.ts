import { readFile } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import ts from 'typescript';
import type { ExtractedCommand, ExtractedOption, SourceSegment } from './types.js';

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

function propertyKey(prop: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
    return null;
  }
  const name = prop.name;
  if (!name) {
    return null;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
    return name.text;
  }
  return null;
}

function getProperty({
  obj,
  key,
}: {
  obj: ts.ObjectLiteralExpression;
  key: string;
}): ts.PropertyAssignment | null {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && propertyKey(p) === key) {
      return p;
    }
  }
  return null;
}

function objectInitializerOf({
  obj,
  key,
}: {
  obj: ts.ObjectLiteralExpression;
  key: string;
}): ts.ObjectLiteralExpression | null {
  const prop = getProperty({ obj, key });
  if (!prop) {
    return null;
  }
  return ts.isObjectLiteralExpression(prop.initializer) ? prop.initializer : null;
}

function objectKeys(obj: ts.ObjectLiteralExpression | null): string[] {
  if (!obj) {
    return [];
  }
  const out: string[] = [];
  for (const p of obj.properties) {
    const k = propertyKey(p);
    if (k !== null) {
      out.push(k);
    }
  }
  return out;
}

/**
 * `true` if the expression contains a call whose callee resolves to an
 * identifier named `boolean` — matches `z.boolean()`, `z.coerce.boolean()`,
 * `boolean()`, etc. Conservative semantic equivalent of the previous regex.
 */
function isBooleanSchema(expr: ts.Expression): boolean {
  let found = false;
  function visit(node: ts.Node) {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'boolean') {
        found = true;
        return;
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.name) &&
        callee.name.text === 'boolean'
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(expr);
  return found;
}

function readBooleanLiteral(expr: ts.Expression): boolean | null {
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (expr.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  return null;
}

function readStringLiteral(expr: ts.Expression): string | null {
  return ts.isStringLiteralLike(expr) ? expr.text : null;
}

function extractOption({
  name,
  initializer,
  filePath,
}: {
  name: string;
  initializer: ts.Expression;
  filePath: string;
}): ExtractedOption {
  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error(
      `parsh: ${filePath} — option '${name}' must be declared as { schema, forwardToChildren?, description? }, not a bare schema`,
    );
  }
  const schemaProp = getProperty({ obj: initializer, key: 'schema' });
  if (!schemaProp) {
    throw new Error(
      `parsh: ${filePath} — option '${name}' is missing required \`schema\` property`,
    );
  }
  const type = isBooleanSchema(schemaProp.initializer) ? 'boolean' : 'string';
  const forwardProp = getProperty({ obj: initializer, key: 'forwardToChildren' });
  let forwardToChildren = false;
  if (forwardProp) {
    const v = readBooleanLiteral(forwardProp.initializer);
    if (v === null) {
      throw new Error(
        `parsh: ${filePath} — option '${name}' \`forwardToChildren\` must be a boolean literal (true | false)`,
      );
    }
    forwardToChildren = v;
  }
  const descProp = getProperty({ obj: initializer, key: 'description' });
  const description = descProp ? (readStringLiteral(descProp.initializer) ?? undefined) : undefined;
  const aliasesProp = getProperty({ obj: initializer, key: 'aliases' });
  const aliases: string[] = [];
  if (aliasesProp) {
    if (!ts.isArrayLiteralExpression(aliasesProp.initializer)) {
      throw new Error(
        `parsh: ${filePath} — option '${name}' \`aliases\` must be an inline array of string literals`,
      );
    }
    for (const el of aliasesProp.initializer.elements) {
      const s = readStringLiteral(el);
      if (s === null) {
        throw new Error(
          `parsh: ${filePath} — option '${name}' \`aliases\` entries must be string literals`,
        );
      }
      aliases.push(s);
    }
  }
  return {
    name,
    type,
    forwardToChildren,
    ...(description !== undefined ? { description } : {}),
    aliases,
  };
}

function extractOptions({
  obj,
  filePath,
}: {
  obj: ts.ObjectLiteralExpression | null;
  filePath: string;
}): ExtractedOption[] {
  if (!obj) {
    return [];
  }
  const out: ExtractedOption[] = [];
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) {
      continue;
    }
    const name = propertyKey(p);
    if (name === null) {
      continue;
    }
    out.push(extractOption({ name, initializer: p.initializer, filePath }));
  }
  return out;
}

function extractDescription(obj: ts.ObjectLiteralExpression): string | undefined {
  const prop = getProperty({ obj, key: 'description' });
  if (!prop) {
    return undefined;
  }
  return ts.isStringLiteralLike(prop.initializer) ? prop.initializer.text : undefined;
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

function importSpecifierFor({ outDir, filePath }: { outDir: string; filePath: string }): string {
  let spec = relative(outDir, filePath);
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
  if (!call || call.arguments.length < 1) {
    throw new Error(`parsh: ${filePath} does not contain a defineRootCommand({ ... }) call`);
  }
  const def = call.arguments[0]!;
  if (!ts.isObjectLiteralExpression(def)) {
    throw new Error(
      `parsh: ${filePath} — defineRootCommand argument must be an inline object literal`,
    );
  }
  const options = extractOptions({
    obj: objectInitializerOf({ obj: def, key: 'options' }),
    filePath,
  });
  return {
    filePath,
    pathString: '',
    segments: [],
    options,
    paramNames: [],
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
  if (!call || call.arguments.length < 2) {
    throw new Error(`parsh: ${filePath} does not contain a defineCommand('...', { ... }) call`);
  }
  const [pathArg, defArg] = call.arguments;
  if (!pathArg || !ts.isStringLiteralLike(pathArg)) {
    throw new Error(
      `parsh: ${filePath} — defineCommand path (first argument) must be a string literal`,
    );
  }
  if (!defArg || !ts.isObjectLiteralExpression(defArg)) {
    throw new Error(
      `parsh: ${filePath} — defineCommand definition (second argument) must be an inline object literal`,
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
  const options = extractOptions({
    obj: objectInitializerOf({ obj: defArg, key: 'options' }),
    filePath,
  });
  const paramNames = objectKeys(objectInitializerOf({ obj: defArg, key: 'params' }));
  const description = extractDescription(defArg);
  return {
    filePath,
    pathString,
    segments,
    options,
    paramNames,
    importName: importNameFor({ filePath }),
    importSpecifier: importSpecifierFor({ outDir, filePath }),
    ...(description !== undefined ? { description } : {}),
  };
}
