import { type ParseArgsConfig, parseArgs } from 'node:util';
import type { AnySchema } from '#schema.ts';

export type TreeSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

/**
 * Structural command shape used at runtime. Matches what `defineCommand` returns,
 * without referencing `CommandRegistry` — which is empty until user augmentation.
 */
export interface RuntimeCommand {
  path: string;
  args: Record<string, AnySchema>;
  params?: Record<string, AnySchema>;
  /**
   * Handler storage. The specific `ctx` shape per command is enforced at the
   * `defineCommand` call site via `HandlerCtx<P>`; `RuntimeCommand` is the
   * structural runtime storage and keeps the signature bivariant.
   */
  // biome-ignore lint/suspicious/noExplicitAny: intentional — see doc above
  handler?: (ctx: any) => void | Promise<void>;
}

export interface RuntimeNode {
  segment: TreeSegment | null;
  command: RuntimeCommand | null;
  literalChildren: Record<string, RuntimeNode>;
  paramChild: RuntimeNode | null;
}

export type ArgsShape = Record<string, AnySchema>;

export interface CreateCliOptions<RootArgs extends ArgsShape = ArgsShape> {
  tree: RuntimeNode;
  args?: RootArgs;
}

function probeBoolean(schema: AnySchema): boolean {
  try {
    const trueResult = schema['~standard'].validate(true);
    if (trueResult instanceof Promise) {
      return false;
    }
    if ('issues' in trueResult && trueResult.issues) {
      return false;
    }
    const stringResult = schema['~standard'].validate('not-a-boolean-xyzzy');
    if (stringResult instanceof Promise) {
      return true;
    }
    return 'issues' in stringResult && !!stringResult.issues;
  } catch {
    return false;
  }
}

function collectAllArgSchemas(opts: { root: ArgsShape; tree: RuntimeNode }): ArgsShape {
  const all: ArgsShape = { ...opts.root };
  function walk(node: RuntimeNode) {
    if (node.command) {
      for (const [name, schema] of Object.entries(node.command.args)) {
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
  walk(opts.tree);
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

function walkTree(opts: { tree: RuntimeNode; positionals: string[] }): WalkResult {
  let node = opts.tree;
  const visitedCommands: Visited[] = [];
  if (node.command) {
    visitedCommands.push({ command: node.command, paramValue: null, paramName: null });
  }
  for (const tok of opts.positionals) {
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

async function validateRecord(opts: {
  schemas: ArgsShape;
  values: Record<string, unknown>;
  kind: 'arg' | 'param';
}): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(opts.schemas)) {
    const raw = opts.values[name];
    if (raw === undefined) {
      const result = schema['~standard'].validate(undefined);
      const settled = result instanceof Promise ? await result : result;
      if ('issues' in settled && settled.issues) {
        return { ok: false, error: `missing required ${opts.kind}: ${name}` };
      }
      out[name] = settled.value;
      continue;
    }
    const result = schema['~standard'].validate(raw);
    const settled = result instanceof Promise ? await result : result;
    if ('issues' in settled && settled.issues) {
      const msg = settled.issues.map((i) => i.message).join(', ');
      return { ok: false, error: `invalid ${opts.kind} "${name}": ${msg}` };
    }
    out[name] = settled.value;
  }
  return { ok: true, value: out };
}

function renderUsage(opts: { root: RuntimeNode; programName: string }): string {
  const lines: string[] = [`Usage: ${opts.programName} <command> [options]`, '', 'Commands:'];
  function walk(input: { node: RuntimeNode; prefix: string[] }) {
    for (const [name, child] of Object.entries(input.node.literalChildren)) {
      const pieces = [...input.prefix, name];
      if (child.command || Object.keys(child.literalChildren).length || child.paramChild) {
        lines.push(`  ${pieces.join(' ')}`);
      }
      walk({ node: child, prefix: pieces });
    }
    if (input.node.paramChild) {
      const pc = input.node.paramChild;
      const segName = pc.segment?.kind === 'param' ? pc.segment.name : 'param';
      const pieces = [...input.prefix, `<${segName}>`];
      if (pc.command || Object.keys(pc.literalChildren).length || pc.paramChild) {
        lines.push(`  ${pieces.join(' ')}`);
      }
      walk({ node: pc, prefix: pieces });
    }
  }
  walk({ node: opts.root, prefix: [] });
  return lines.join('\n');
}

function detectSameLevelCollisions(tree: RuntimeNode): string[] {
  const issues: string[] = [];
  function walk(input: { node: RuntimeNode; path: string[] }) {
    if (input.node.command) {
      const paramName = input.node.segment?.kind === 'param' ? input.node.segment.name : null;
      if (paramName !== null && paramName in input.node.command.args) {
        issues.push(
          `command ${input.path.join(' ') || '(root)'} declares arg "${paramName}" that shadows its own param [${paramName}]`,
        );
      }
    }
    for (const [name, child] of Object.entries(input.node.literalChildren)) {
      walk({ node: child, path: [...input.path, name] });
    }
    if (input.node.paramChild) {
      const seg = input.node.paramChild.segment;
      const label = seg?.kind === 'param' ? `[${seg.name}]` : '';
      walk({ node: input.node.paramChild, path: [...input.path, label] });
    }
  }
  walk({ node: tree, path: [] });
  return issues;
}

export class Cli {
  readonly #tree: RuntimeNode;
  readonly #rootArgs: ArgsShape;
  readonly #parseOptions: ParseArgsConfig['options'];

  constructor(options: CreateCliOptions) {
    const issues = detectSameLevelCollisions(options.tree);
    if (issues.length > 0) {
      throw new Error(
        `parsh: command tree has ${issues.length} issue(s):\n${issues.map((i) => `  - ${i}`).join('\n')}`,
      );
    }
    this.#tree = options.tree;
    this.#rootArgs = options.args ?? {};

    const allSchemas = collectAllArgSchemas({ root: this.#rootArgs, tree: this.#tree });
    const parseOptions: ParseArgsConfig['options'] = {};
    for (const [name, schema] of Object.entries(allSchemas)) {
      parseOptions[name] = { type: probeBoolean(schema) ? 'boolean' : 'string' };
    }
    this.#parseOptions = parseOptions;
  }

  /** Run against an explicit argv. For tests / programmatic use. */
  async run(argv: string[]): Promise<number> {
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log(renderUsage({ root: this.#tree, programName: 'cli' }));
      return 0;
    }

    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: argv,
        options: this.#parseOptions,
        strict: false,
        allowPositionals: true,
      });
    } catch (err) {
      console.error(`parsh: failed to parse arguments: ${(err as Error).message}`);
      return 2;
    }

    const { node, visitedCommands, unknown, unknownToken } = walkTree({
      tree: this.#tree,
      positionals: parsed.positionals,
    });

    if (unknown) {
      console.error(`parsh: unknown command: ${unknownToken}`);
      return 2;
    }

    if (!node.command) {
      console.log(renderUsage({ root: this.#tree, programName: 'cli' }));
      return 0;
    }

    const accumulatedArgSchemas: ArgsShape = { ...this.#rootArgs };
    for (const v of visitedCommands) {
      if (v.command) {
        for (const [name, schema] of Object.entries(v.command.args)) {
          accumulatedArgSchemas[name] = schema;
        }
      }
    }

    const paramSchemas: ArgsShape = {};
    const paramRawValues: Record<string, unknown> = {};
    for (const v of visitedCommands) {
      if (v.paramName && v.command) {
        const schema = v.command.params?.[v.paramName];
        if (schema) {
          paramSchemas[v.paramName] = schema;
          paramRawValues[v.paramName] = v.paramValue;
        }
      }
    }

    const argsResult = await validateRecord({
      schemas: accumulatedArgSchemas,
      values: parsed.values as Record<string, unknown>,
      kind: 'arg',
    });
    if (!argsResult.ok) {
      console.error(`parsh: ${argsResult.error}`);
      return 2;
    }

    const paramsResult = await validateRecord({
      schemas: paramSchemas,
      values: paramRawValues,
      kind: 'param',
    });
    if (!paramsResult.ok) {
      console.error(`parsh: ${paramsResult.error}`);
      return 2;
    }

    const ctx = { args: argsResult.value, params: paramsResult.value };

    if (!node.command.handler) {
      console.log(renderUsage({ root: this.#tree, programName: 'cli' }));
      return 0;
    }

    try {
      await node.command.handler(ctx);
      return 0;
    } catch (err) {
      console.error(`parsh: handler error: ${(err as Error).message}`);
      return 1;
    }
  }

  /** Run against `process.argv.slice(2)` and exit with the result code. */
  async main(): Promise<never> {
    const code = await this.run(process.argv.slice(2));
    process.exit(code);
  }
}

export function createCLI<RootArgs extends ArgsShape = ArgsShape>(
  options: CreateCliOptions<RootArgs>,
): Cli {
  return new Cli(options);
}
