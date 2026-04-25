import { type ParseArgsConfig, parseArgs } from 'node:util';
import type { ResolveContext } from '#registry.ts';
import type { AnyOption, AnySchema, OptionsRecord } from '#schema.ts';

type TreeSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

export interface OptionMeta {
  name: string;
  type: 'boolean' | 'string';
  forwardToChildren?: boolean;
  description?: string;
}

export interface LoadedCommand {
  options: OptionsRecord;
  params?: Record<string, AnySchema>;
  /** @default { enabled: true } */
  helpArg?: { enabled: boolean };
  // `any` is required so hand-built commands can use specific `ctx` shapes —
  // contravariance forbids the same with `unknown`. The real ctx type is
  // enforced at the `defineCommand` call site.
  // biome-ignore lint/suspicious/noExplicitAny: see note above
  handler?: (ctx: any) => void | Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: see handler note above
  beforeHandler?: (ctx: any) => void | Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: see handler note above
  afterHandler?: (ctx: any) => void | Promise<void>;
}

/**
 * What sits in `RuntimeNode.command`. Carries only the metadata needed to
 * route, render help, and report unknown-command errors. The real schemas and
 * handler live behind `load()` and are fetched on dispatch (lazy mode) or
 * already in memory (eager mode).
 */
export interface RuntimeCommand {
  path: string;
  optionNames: ReadonlyArray<OptionMeta>;
  paramNames: ReadonlyArray<string>;
  description?: string;
  load: () => Promise<LoadedCommand>;
}

export interface RuntimeNode {
  segment: TreeSegment | null;
  command: RuntimeCommand | null;
  literalChildren: Record<string, RuntimeNode>;
  paramChild: RuntimeNode | null;
}

type ContextValue = object;
type ContextFactory<C extends ContextValue> = () => C | Promise<C>;
export type CliContextInput<C extends ContextValue = ContextValue> = C | ContextFactory<C>;

interface CreateCliOptions<C extends CliContextInput | undefined = CliContextInput | undefined> {
  programName: string;
  programDescription?: string;
  tree: RuntimeNode;
  /**
   * Object (or factory returning one) merged into every handler's `ctx`. The
   * factory form runs once per `cli.run()` call so each invocation gets a
   * fresh context. Register the resulting `Cli` instance via `Register` to
   * make these fields visible to every handler's `ctx` type.
   */
  context?: C;
}

export class CommandLoadError extends Error {
  readonly path: string;
  // biome-ignore lint/suspicious/noExplicitAny: error cause is unknown
  override readonly cause: any;
  constructor({ path, cause }: { path: string; cause: unknown }) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`failed to load command '${path || '<root>'}': ${reason}`);
    this.name = 'CommandLoadError';
    this.path = path;
    this.cause = cause;
  }
}

type SchemaRecord = Record<string, AnySchema>;

function optionSchemasFor({
  options,
  includeSelfOnly,
}: {
  options: OptionsRecord;
  includeSelfOnly: boolean;
}): SchemaRecord {
  const out: SchemaRecord = {};
  for (const [name, opt] of Object.entries(options) as Array<[string, AnyOption]>) {
    if (!includeSelfOnly && opt.forwardToChildren !== true) {
      continue;
    }
    out[name] = opt.schema;
  }
  return out;
}

function collectParseOptions(tree: RuntimeNode): ParseArgsConfig['options'] {
  const out: NonNullable<ParseArgsConfig['options']> = {};
  function walk(node: RuntimeNode) {
    if (node.command) {
      for (const opt of node.command.optionNames) {
        out[opt.name] = { type: opt.type };
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
  return out;
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

function walkTree({ tree, positionals }: { tree: RuntimeNode; positionals: string[] }): WalkResult {
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

  const rootOptions = root.command?.optionNames ?? [];
  if (rootOptions.length > 0) {
    lines.push('Options:');
    for (const line of formatTwoColumn(
      rootOptions.map((o) => ({ label: `--${o.name}`, description: o.description })),
    )) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  lines.push('Commands:');
  const rows: Array<{ label: string; description: string | undefined }> = [];
  function walk({ node, prefix }: { node: RuntimeNode; prefix: string[] }) {
    for (const [name, child] of Object.entries(node.literalChildren)) {
      const pieces = [...prefix, name];
      if (child.command || Object.keys(child.literalChildren).length || child.paramChild) {
        rows.push({ label: pieces.join(' '), description: child.command?.description });
      }
      walk({ node: child, prefix: pieces });
    }
    if (node.paramChild) {
      const pc = node.paramChild;
      const segName = pc.segment?.kind === 'param' ? pc.segment.name : 'param';
      const pieces = [...prefix, `<${segName}>`];
      if (pc.command || Object.keys(pc.literalChildren).length || pc.paramChild) {
        rows.push({ label: pieces.join(' '), description: pc.command?.description });
      }
      walk({ node: pc, prefix: pieces });
    }
  }
  walk({ node: root, prefix: [] });
  for (const line of formatTwoColumn(rows)) {
    lines.push(`  ${line}`);
  }
  return lines.join('\n');
}

function formatTwoColumn(
  rows: ReadonlyArray<{ label: string; description: string | undefined }>,
): string[] {
  const width = rows.reduce(
    // biome-ignore lint/complexity/useMaxParams: Array.reduce callback is inherently (acc, item)
    (w, r) => Math.max(w, r.label.length),
    0,
  );
  return rows.map((r) => (r.description ? `${r.label.padEnd(width)}  ${r.description}` : r.label));
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
  if (cmd.description) {
    lines.push(cmd.description, '');
  }
  lines.push(`Usage: ${programName} ${segments.join(' ')} [options]`, '');

  if (cmd.optionNames.length > 0) {
    lines.push('Options:');
    for (const line of formatTwoColumn(
      cmd.optionNames.map((o) => ({ label: `--${o.name}`, description: o.description })),
    )) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  const inheritedRows: Array<{ label: string; description: string | undefined }> = [];
  for (const v of visited) {
    if (v.path === cmd.path) {
      continue;
    }
    const from = v.path === '' ? '<root>' : v.path;
    for (const opt of v.optionNames) {
      if (opt.forwardToChildren !== true) {
        continue;
      }
      const descParts = [opt.description, `(inherited from ${from})`].filter(Boolean);
      inheritedRows.push({ label: `--${opt.name}`, description: descParts.join(' ') });
    }
  }
  if (inheritedRows.length > 0) {
    lines.push('Inherited options:');
    for (const line of formatTwoColumn(inheritedRows)) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  const subs = Object.keys(node.literalChildren).sort();
  if (subs.length > 0 || node.paramChild) {
    lines.push('Subcommands:');
    const rows: Array<{ label: string; description: string | undefined }> = [];
    for (const name of subs) {
      const child = node.literalChildren[name]!;
      rows.push({ label: name, description: child.command?.description });
    }
    if (node.paramChild?.segment?.kind === 'param') {
      rows.push({
        label: `<${node.paramChild.segment.name}>`,
        description: node.paramChild.command?.description,
      });
    }
    for (const line of formatTwoColumn(rows)) {
      lines.push(`  ${line}`);
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
      if (paramName !== null && node.command.optionNames.some((o) => o.name === paramName)) {
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

async function loadCommand(cmd: RuntimeCommand): Promise<LoadedCommand> {
  try {
    return await cmd.load();
  } catch (cause) {
    throw new CommandLoadError({ path: cmd.path, cause });
  }
}

type LifecycleResult = { ok: true } | { ok: false; error: Error };

// biome-ignore lint/suspicious/noExplicitAny: ctx shape is enforced at the defineCommand call site (see LoadedCommand)
type Hook = (ctx: any) => void | Promise<void>;

async function runHandlerLifecycle({
  beforeHandler,
  handler,
  afterHandler,
  ctx,
}: {
  beforeHandler: Hook | undefined;
  handler: Hook;
  afterHandler: Hook | undefined;
  ctx: unknown;
}): Promise<LifecycleResult> {
  const steps: ReadonlyArray<Hook | undefined> = [beforeHandler, handler, afterHandler];
  for (const fn of steps) {
    if (!fn) {
      continue;
    }
    try {
      await fn(ctx);
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
  return { ok: true };
}

export class Cli<C extends object = Record<string, never>> {
  /**
   * Phantom field carrying the resolved context type so user code can register
   * the instance via `interface Register { cli: typeof cli }` and have every
   * handler's `ctx` see the context fields. Never assigned at runtime.
   */
  declare readonly _context: C;

  readonly #tree: RuntimeNode;
  readonly #programName: string;
  readonly #programDescription: string | undefined;
  readonly #parseOptions: ParseArgsConfig['options'];
  readonly #context: CliContextInput | undefined;

  constructor({ programName, programDescription, tree, context }: CreateCliOptions) {
    const issues = detectSameLevelCollisions(tree);
    if (issues.length > 0) {
      throw new Error(
        `${programName}: command tree has ${issues.length} issue(s):\n${issues.map((i) => `  - ${i}`).join('\n')}`,
      );
    }
    this.#tree = tree;
    this.#programName = programName;
    this.#programDescription = programDescription;
    this.#parseOptions = collectParseOptions(tree);
    this.#context = context;
  }

  #resolveContext(): Promise<object> {
    if (this.#context === undefined) {
      return Promise.resolve({});
    }
    if (typeof this.#context === 'function') {
      return Promise.resolve(this.#context());
    }
    return Promise.resolve(this.#context);
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
      console.error(`${this.#errorPrefix()}: ${(err as Error).message}`);
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
      console.error(
        `${this.#errorPrefix()}: unknown command: ${unknownToken} — run \`${this.#programName} --help\` to see available commands`,
      );
      return 2;
    }

    if (!node.command) {
      console.log(this.#renderRootUsage());
      return 0;
    }

    if (wantsHelp) {
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

    const visitedCmds = visitedCommands
      .map((v) => v.command)
      .filter((c): c is RuntimeCommand => c !== null);
    let loaded: Map<RuntimeCommand, LoadedCommand>;
    try {
      const pairs = await Promise.all(
        visitedCmds.map(async (c) => [c, await loadCommand(c)] as const),
      );
      loaded = new Map(pairs);
    } catch (err) {
      if (err instanceof CommandLoadError) {
        console.error(`${this.#errorPrefix()}: ${err.message}`);
        return 1;
      }
      throw err;
    }

    const targetLoaded = loaded.get(node.command)!;
    const targetHelpEnabled = targetLoaded.helpArg?.enabled !== false;

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
      const loadedCmd = loaded.get(v.command)!;
      const isTargetVisit = i === visitedCommands.length - 1;
      const optionSchemas = optionSchemasFor({
        options: loadedCmd.options,
        includeSelfOnly: isTargetVisit,
      });
      const optionsResult = await validateRecord({
        schemas: optionSchemas,
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
        const schema = loadedCmd.params?.[v.paramName];
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

    const resolvedContext = await this.#resolveContext();
    const ctx = {
      ...resolvedContext,
      options: targetOwnOptions,
      params: targetOwnParams,
      parents,
      root: { options: rootOptions },
    };

    if (!targetLoaded.handler) {
      console.log(
        node === this.#tree
          ? this.#renderRootUsage()
          : renderCommandUsage({
              programName: this.#programName,
              node,
              visited: visitedCmds,
            }),
      );
      return 0;
    }

    const result = await runHandlerLifecycle({
      handler: targetLoaded.handler,
      beforeHandler: targetLoaded.beforeHandler,
      afterHandler: targetLoaded.afterHandler,
      ctx,
    });
    if (result.ok) {
      return 0;
    }
    console.error(`${this.#errorPrefix()}: ${result.error.message}`);
    return 1;
  }

  async main(): Promise<never> {
    const code = await this.run(process.argv.slice(2));
    process.exit(code);
  }
}

export function createCli<const C extends CliContextInput | undefined = undefined>(
  options: CreateCliOptions<C>,
): Cli<ResolveContext<C>> {
  return new Cli(options) as Cli<ResolveContext<C>>;
}
