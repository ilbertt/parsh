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
  helpArg?: { enabled: boolean };
  /**
   * Structural runtime handler. `ctx` is widened with `any` so that hand-built
   * `RuntimeCommand`s in tests (or user code) can use specific `ctx` shapes —
   * contravariance forbids the same with `unknown`. The ctx type that matters
   * is enforced at the `defineCommand` call site via `HandlerCtx<P>`.
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
  /** Program name — shown in usage and used as the prefix for error messages. */
  programName: string;
  /** Optional one-liner printed above the usage block. */
  programDescription?: string;
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

function renderRootUsage(opts: {
  root: RuntimeNode;
  programName: string;
  programDescription: string | undefined;
}): string {
  const lines: string[] = [];
  if (opts.programDescription) {
    lines.push(opts.programDescription, '');
  }
  lines.push(`Usage: ${opts.programName} <command> [options]`, '', 'Commands:');
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

function renderCommandUsage(opts: {
  programName: string;
  node: RuntimeNode;
  visited: ReadonlyArray<RuntimeCommand>;
}): string {
  const cmd = opts.node.command!;
  const segments = cmd.path.split(' ').map((s) => (s.startsWith('[') ? `<${s.slice(1, -1)}>` : s));
  const lines: string[] = [];
  lines.push(`Usage: ${opts.programName} ${segments.join(' ')} [options]`, '');

  const ownArgs = Object.keys(cmd.args);
  if (ownArgs.length > 0) {
    lines.push('Arguments:');
    for (const name of ownArgs) {
      lines.push(`  --${name}`);
    }
    lines.push('');
  }

  const inheritedArgs: string[] = [];
  for (const v of opts.visited) {
    if (v.path === cmd.path) {
      continue;
    }
    for (const name of Object.keys(v.args)) {
      inheritedArgs.push(`--${name}  (from ${v.path})`);
    }
  }
  if (inheritedArgs.length > 0) {
    lines.push('Inherited:');
    for (const line of inheritedArgs) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  const subs = Object.keys(opts.node.literalChildren).sort();
  if (subs.length > 0 || opts.node.paramChild) {
    lines.push('Subcommands:');
    for (const name of subs) {
      lines.push(`  ${name}`);
    }
    if (opts.node.paramChild?.segment?.kind === 'param') {
      lines.push(`  <${opts.node.paramChild.segment.name}>`);
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
  readonly #programName: string;
  readonly #programDescription: string | undefined;
  readonly #parseOptions: ParseArgsConfig['options'];

  constructor(options: CreateCliOptions) {
    const issues = detectSameLevelCollisions(options.tree);
    if (issues.length > 0) {
      throw new Error(
        `${options.programName}: command tree has ${issues.length} issue(s):\n${issues.map((i) => `  - ${i}`).join('\n')}`,
      );
    }
    this.#tree = options.tree;
    this.#rootArgs = options.args ?? {};
    this.#programName = options.programName;
    this.#programDescription = options.programDescription;

    const allSchemas = collectAllArgSchemas({ root: this.#rootArgs, tree: this.#tree });
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

  /** Run against an explicit argv. For tests / programmatic use. */
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

    if (parsed.positionals.length === 0 && wantsHelp) {
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
        renderCommandUsage({
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
    const rootResult = await validateRecord({
      schemas: this.#rootArgs,
      values: rawValues,
      kind: 'arg',
    });
    if (!rootResult.ok) {
      console.error(`${this.#errorPrefix()}: ${rootResult.error}${helpHint(targetHelpEnabled)}`);
      return 2;
    }

    const parents: Record<
      string,
      { args: Record<string, unknown>; params: Record<string, unknown> }
    > = {};
    let targetOwnArgs: Record<string, unknown> = {};
    let targetOwnParams: Record<string, unknown> = {};

    for (let i = 0; i < visitedCommands.length; i++) {
      const v = visitedCommands[i]!;
      if (!v.command) {
        continue;
      }
      const argsResult = await validateRecord({
        schemas: v.command.args,
        values: rawValues,
        kind: 'arg',
      });
      if (!argsResult.ok) {
        console.error(`${this.#errorPrefix()}: ${argsResult.error}${helpHint(targetHelpEnabled)}`);
        return 2;
      }

      const ownParamValues: Record<string, unknown> = {};
      const ownParamSchemas: ArgsShape = {};
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
      if (isTarget) {
        targetOwnArgs = argsResult.value;
        targetOwnParams = paramsResult.value;
      } else {
        parents[v.command.path] = { args: argsResult.value, params: paramsResult.value };
      }
    }

    const ctx = {
      args: targetOwnArgs,
      params: targetOwnParams,
      parents,
      root: { args: rootResult.value },
    };

    if (!node.command.handler) {
      console.log(
        renderCommandUsage({
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

  /** Run against `process.argv.slice(2)` and exit with the result code. */
  async main(): Promise<never> {
    const code = await this.run(process.argv.slice(2));
    process.exit(code);
  }
}

export function createCli<RootArgs extends ArgsShape = ArgsShape>(
  options: CreateCliOptions<RootArgs>,
): Cli {
  return new Cli(options);
}
