import { type ParseArgsConfig, parseArgs } from 'node:util';
import type { AnySchema } from '#schema.ts';

type TreeSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

export interface RuntimeCommand {
  path: string;
  options: Record<string, AnySchema>;
  params?: Record<string, AnySchema>;
  helpArg?: { enabled: boolean };
  // `any` is required so hand-built `RuntimeCommand`s can use specific `ctx`
  // shapes — contravariance forbids the same with `unknown`. The real ctx
  // type is enforced at the `defineCommand` call site.
  // biome-ignore lint/suspicious/noExplicitAny: see note above
  handler?: (ctx: any) => void | Promise<void>;
}

export interface RuntimeNode {
  segment: TreeSegment | null;
  command: RuntimeCommand | null;
  literalChildren: Record<string, RuntimeNode>;
  paramChild: RuntimeNode | null;
}

type SchemaRecord = Record<string, AnySchema>;

interface CreateCliOptions {
  programName: string;
  programDescription?: string;
  tree: RuntimeNode;
}

function probeBoolean(schema: AnySchema): boolean {
  const accepts = (value: unknown): boolean => {
    try {
      const r = schema['~standard'].validate(value);
      if (r instanceof Promise) {
        return false;
      }
      return !('issues' in r && r.issues);
    } catch {
      return false;
    }
  };
  // A boolean-flag schema must accept both `true` and `false`, but reject
  // numeric and string inputs — otherwise we misclassify coerce-style schemas
  // (e.g., `z.coerce.number()` accepts `true`/`false` via numeric coercion).
  return accepts(true) && accepts(false) && !accepts(0) && !accepts('not-a-boolean-xyzzy');
}

function collectAllOptionSchemas(tree: RuntimeNode): SchemaRecord {
  const all: SchemaRecord = {};
  function walk(node: RuntimeNode) {
    if (node.command) {
      for (const [name, schema] of Object.entries(node.command.options)) {
        all[name] = schema;
      }
    }
    for (const child of Object.values(node.literalChildren)) {
      walk(child);
    }
    if (node.paramChild) {
      walk(node.paramChild);
    }
  }
  walk(tree);
  return all;
}

interface Visited {
  command: RuntimeCommand | null;
  paramValue: string | null;
  paramName: string | null;
}

interface WalkResult {
  node: RuntimeNode;
  visitedCommands: ReadonlyArray<Visited>;
  unknown: boolean;
  unknownToken: string | null;
}

function walkTree({
  tree,
  positionals,
}: {
  tree: RuntimeNode;
  positionals: string[];
}): WalkResult {
  let node = tree;
  const visitedCommands: Visited[] = [];
  if (node.command) {
    visitedCommands.push({ command: node.command, paramValue: null, paramName: null });
  }
  for (const tok of positionals) {
    const literal = node.literalChildren[tok];
    if (literal) {
      node = literal;
      if (node.command) {
        visitedCommands.push({ command: node.command, paramValue: null, paramName: null });
      }
      continue;
    }
    if (node.paramChild) {
      node = node.paramChild;
      const paramName = node.segment?.kind === 'param' ? node.segment.name : null;
      visitedCommands.push({ command: node.command, paramValue: tok, paramName });
      continue;
    }
    return { node, visitedCommands, unknown: true, unknownToken: tok };
  }
  return { node, visitedCommands, unknown: false, unknownToken: null };
}

type SchemaResult = { value: unknown; issues?: undefined } | { issues: ReadonlyArray<unknown> };

async function settle({
  schema,
  value,
}: {
  schema: AnySchema;
  value: unknown;
}): Promise<SchemaResult> {
  const r = schema['~standard'].validate(value);
  return r instanceof Promise ? await r : r;
}

/**
 * argv values arrive as strings. Try the raw string first, then a numeric
 * coercion, then a boolean coercion — first success wins. Lets users write
 * `z.number()` / `z.boolean()` without `z.coerce.*`. Schemas that accept the
 * string as-is are unaffected.
 */
async function validateScalar({
  schema,
  raw,
}: {
  schema: AnySchema;
  raw: unknown;
}): Promise<SchemaResult> {
  const first = await settle({ schema, value: raw });
  if (!('issues' in first && first.issues)) {
    return first;
  }
  if (typeof raw !== 'string' || raw.length === 0) {
    return first;
  }
  if (raw.trim().length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const r = await settle({ schema, value: n });
      if (!('issues' in r && r.issues)) {
        return r;
      }
    }
  }
  if (raw === 'true' || raw === 'false') {
    const r = await settle({ schema, value: raw === 'true' });
    if (!('issues' in r && r.issues)) {
      return r;
    }
  }
  return first;
}

async function validateRecord({
  schemas,
  values,
  kind,
}: {
  schemas: SchemaRecord;
  values: Record<string, unknown>;
  kind: 'option' | 'param';
}): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const raw = values[name];
    if (raw === undefined) {
      const settled = await settle({ schema, value: undefined });
      if ('issues' in settled && settled.issues) {
        return { ok: false, error: `missing required ${kind}: ${name}` };
      }
      out[name] = settled.value;
      continue;
    }
    const settled = await validateScalar({ schema, raw });
    if ('issues' in settled && settled.issues) {
      const msg = settled.issues.map((i) => (i as { message: string }).message).join(', ');
      return { ok: false, error: `invalid ${kind} "${name}": ${msg}` };
    }
    out[name] = settled.value;
  }
  return { ok: true, value: out };
}

function renderRootUsage({
  root,
  programName,
  programDescription,
}: {
  root: RuntimeNode;
  programName: string;
  programDescription: string | undefined;
}): string {
  const lines: string[] = [];
  if (programDescription) {
    lines.push(programDescription, '');
  }
  lines.push(`Usage: ${programName} <command> [options]`, '');

  const rootOptions = root.command ? Object.keys(root.command.options) : [];
  if (rootOptions.length > 0) {
    lines.push('Options:');
    for (const name of rootOptions) {
      lines.push(`  --${name}`);
    }
    lines.push('');
  }

  lines.push('Commands:');
  function walk({ node, prefix }: { node: RuntimeNode; prefix: string[] }) {
    for (const [name, child] of Object.entries(node.literalChildren)) {
      const pieces = [...prefix, name];
      if (child.command || Object.keys(child.literalChildren).length || child.paramChild) {
        lines.push(`  ${pieces.join(' ')}`);
      }
      walk({ node: child, prefix: pieces });
    }
    if (node.paramChild) {
      const pc = node.paramChild;
      const segName = pc.segment?.kind === 'param' ? pc.segment.name : 'param';
      const pieces = [...prefix, `<${segName}>`];
      if (pc.command || Object.keys(pc.literalChildren).length || pc.paramChild) {
        lines.push(`  ${pieces.join(' ')}`);
      }
      walk({ node: pc, prefix: pieces });
    }
  }
  walk({ node: root, prefix: [] });
  return lines.join('\n');
}

function renderCommandUsage({
  programName,
  node,
  visited,
}: {
  programName: string;
  node: RuntimeNode;
  visited: ReadonlyArray<RuntimeCommand>;
}): string {
  const cmd = node.command!;
  const segments = cmd.path.split(' ').map((s) => (s.startsWith('[') ? `<${s.slice(1, -1)}>` : s));
  const lines: string[] = [];
  lines.push(`Usage: ${programName} ${segments.join(' ')} [options]`, '');

  const ownOptions = Object.keys(cmd.options);
  if (ownOptions.length > 0) {
    lines.push('Options:');
    for (const name of ownOptions) {
      lines.push(`  --${name}`);
    }
    lines.push('');
  }

  const inheritedOptions: string[] = [];
  for (const v of visited) {
    if (v.path === cmd.path) {
      continue;
    }
    const from = v.path === '' ? '<root>' : v.path;
    for (const name of Object.keys(v.options)) {
      inheritedOptions.push(`--${name}  (from ${from})`);
    }
  }
  if (inheritedOptions.length > 0) {
    lines.push('Inherited options:');
    for (const line of inheritedOptions) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  const subs = Object.keys(node.literalChildren).sort();
  if (subs.length > 0 || node.paramChild) {
    lines.push('Subcommands:');
    for (const name of subs) {
      lines.push(`  ${name}`);
    }
    if (node.paramChild?.segment?.kind === 'param') {
      lines.push(`  <${node.paramChild.segment.name}>`);
    }
  }

  return lines.join('\n').trimEnd();
}

function helpRequested(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h');
}

function helpHint(enabled: boolean): string {
  return enabled ? ' — use --help or -h to see usage' : '';
}

function detectSameLevelCollisions(tree: RuntimeNode): string[] {
  const issues: string[] = [];
  function walk({ node, path }: { node: RuntimeNode; path: string[] }) {
    if (node.command) {
      const paramName = node.segment?.kind === 'param' ? node.segment.name : null;
      if (paramName !== null && paramName in node.command.options) {
        issues.push(
          `command ${path.join(' ') || '(root)'} declares option "${paramName}" that shadows its own param [${paramName}]`,
        );
      }
    }
    for (const [name, child] of Object.entries(node.literalChildren)) {
      walk({ node: child, path: [...path, name] });
    }
    if (node.paramChild) {
      const seg = node.paramChild.segment;
      const label = seg?.kind === 'param' ? `[${seg.name}]` : '';
      walk({ node: node.paramChild, path: [...path, label] });
    }
  }
  walk({ node: tree, path: [] });
  return issues;
}

export class Cli {
  readonly #tree: RuntimeNode;
  readonly #programName: string;
  readonly #programDescription: string | undefined;
  readonly #parseOptions: ParseArgsConfig['options'];

  constructor({ programName, programDescription, tree }: CreateCliOptions) {
    const issues = detectSameLevelCollisions(tree);
    if (issues.length > 0) {
      throw new Error(
        `${programName}: command tree has ${issues.length} issue(s):\n${issues.map((i) => `  - ${i}`).join('\n')}`,
      );
    }
    this.#tree = tree;
    this.#programName = programName;
    this.#programDescription = programDescription;

    const allSchemas = collectAllOptionSchemas(this.#tree);
    const parseOptions: ParseArgsConfig['options'] = {};
    for (const [name, schema] of Object.entries(allSchemas)) {
      parseOptions[name] = { type: probeBoolean(schema) ? 'boolean' : 'string' };
    }
    this.#parseOptions = parseOptions;
  }

  #renderRootUsage(): string {
    return renderRootUsage({
      root: this.#tree,
      programName: this.#programName,
      programDescription: this.#programDescription,
    });
  }

  #errorPrefix(): string {
    return this.#programName;
  }

  async run(argv: string[]): Promise<number> {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: argv,
        options: this.#parseOptions,
        strict: false,
        allowPositionals: true,
      });
    } catch (err) {
      console.error(`${this.#errorPrefix()}: failed to parse arguments: ${(err as Error).message}`);
      return 2;
    }

    const wantsHelp = helpRequested(argv);

    if (parsed.positionals.length === 0 && wantsHelp && !this.#tree.command) {
      console.log(this.#renderRootUsage());
      return 0;
    }

    const { node, visitedCommands, unknown, unknownToken } = walkTree({
      tree: this.#tree,
      positionals: parsed.positionals,
    });

    if (unknown) {
      console.error(`${this.#errorPrefix()}: unknown command: ${unknownToken}`);
      return 2;
    }

    if (!node.command) {
      console.log(this.#renderRootUsage());
      return 0;
    }

    const targetHelpEnabled = node.command.helpArg?.enabled !== false;
    if (wantsHelp && targetHelpEnabled) {
      console.log(
        node === this.#tree
          ? this.#renderRootUsage()
          : renderCommandUsage({
              programName: this.#programName,
              node,
              visited: visitedCommands
                .map((v) => v.command)
                .filter((c): c is RuntimeCommand => c !== null),
            }),
      );
      return 0;
    }

    const rawValues = parsed.values as Record<string, unknown>;
    const rootCommand = this.#tree.command;

    const parents: Record<
      string,
      { options: Record<string, unknown>; params: Record<string, unknown> }
    > = {};
    let rootOptions: Record<string, unknown> = {};
    let targetOwnOptions: Record<string, unknown> = {};
    let targetOwnParams: Record<string, unknown> = {};

    for (let i = 0; i < visitedCommands.length; i++) {
      const v = visitedCommands[i]!;
      if (!v.command) {
        continue;
      }
      const optionsResult = await validateRecord({
        schemas: v.command.options,
        values: rawValues,
        kind: 'option',
      });
      if (!optionsResult.ok) {
        console.error(
          `${this.#errorPrefix()}: ${optionsResult.error}${helpHint(targetHelpEnabled)}`,
        );
        return 2;
      }

      const ownParamValues: Record<string, unknown> = {};
      const ownParamSchemas: SchemaRecord = {};
      if (v.paramName) {
        const schema = v.command.params?.[v.paramName];
        if (schema) {
          ownParamSchemas[v.paramName] = schema;
          ownParamValues[v.paramName] = v.paramValue;
        }
      }
      const paramsResult = await validateRecord({
        schemas: ownParamSchemas,
        values: ownParamValues,
        kind: 'param',
      });
      if (!paramsResult.ok) {
        console.error(
          `${this.#errorPrefix()}: ${paramsResult.error}${helpHint(targetHelpEnabled)}`,
        );
        return 2;
      }

      const isTarget = i === visitedCommands.length - 1;
      const isRoot = v.command === rootCommand;
      if (isRoot) {
        rootOptions = optionsResult.value;
      }
      if (isTarget) {
        targetOwnOptions = optionsResult.value;
        targetOwnParams = paramsResult.value;
      } else if (!isRoot) {
        parents[v.command.path] = { options: optionsResult.value, params: paramsResult.value };
      }
    }

    const ctx = {
      options: targetOwnOptions,
      params: targetOwnParams,
      parents,
      root: { options: rootOptions },
    };

    if (!node.command.handler) {
      console.log(
        node === this.#tree
          ? this.#renderRootUsage()
          : renderCommandUsage({
              programName: this.#programName,
              node,
              visited: visitedCommands
                .map((v) => v.command)
                .filter((c): c is RuntimeCommand => c !== null),
            }),
      );
      return 0;
    }

    try {
      await node.command.handler(ctx);
      return 0;
    } catch (err) {
      console.error(`${this.#errorPrefix()}: handler error: ${(err as Error).message}`);
      return 1;
    }
  }

  async main(): Promise<never> {
    const code = await this.run(process.argv.slice(2));
    process.exit(code);
  }
}

export function createCli(options: CreateCliOptions): Cli {
  return new Cli(options);
}
