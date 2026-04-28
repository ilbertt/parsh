import { type ParseArgsConfig, parseArgs } from 'node:util';
import { BuiltInErrorCode, EXIT_FAILURE, EXIT_USAGE } from './errors/codes.js';
import { handleError, matchRegisteredError } from './errors/handle.js';
import { CommandLoadError } from './errors/load-error.js';
import type { ErrorsRecord, OnError, OnErrorHandlerCtx } from './errors/types.js';
import { print } from './print.js';
import type { ResolveContext } from './registry.js';
import type { AnyOption, AnyParam, AnySchema, OptionsRecord, ParamsRecord } from './schema.js';
import { stderrDim, stdoutBold, stdoutCyan, stdoutDim } from './style.js';

type TreeSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

export interface OptionMeta {
  name: string;
  type: 'boolean' | 'string';
  forwardToChildren?: boolean;
  description?: string;
  aliases?: ReadonlyArray<string>;
}

export interface LoadedCommand {
  options: OptionsRecord;
  params?: ParamsRecord;
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
  hidden?: boolean;
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

type ResolveContextOrEmpty<C> =
  ResolveContext<C> extends never ? Record<string, never> : ResolveContext<C>;

interface CreateCliOptions<
  C extends CliContextInput | undefined = CliContextInput | undefined,
  E extends ErrorsRecord = ErrorsRecord,
> {
  programName: string;
  programDescription?: string;
  tree: RuntimeNode;
  /**
   * Version string printed when the user passes `--version` or `-V`.
   */
  version?: string;
  /**
   * Object (or factory returning one) exposed on every handler's `ctx.context`.
   * The factory form runs once per `cli.run()` call so each invocation gets a
   * fresh context. Register the resulting `Cli` instance via `Register` to
   * make this type visible to every handler's `ctx.context`.
   */
  context?: C;
  /**
   * Custom error classes (Error subclasses). The object key is the `code`
   * surfaced to `onError`. Insertion order controls the `instanceof` walk;
   * register most-specific subclasses first.
   */
  errors?: E;
  /**
   * Centralized error hook. Fires for parse, validation, load, and handler
   * errors. Return `exit(n)` to override the exit code and suppress default
   * stderr output; return `void` to fall through.
   */
  onError?: OnError<E, ResolveContextOrEmpty<C>>;
}

interface SchemaSpec {
  schema: AnySchema;
  required?: boolean;
}

type SpecRecord = Record<string, SchemaSpec>;

function optionSpecsFor({
  options,
  includeSelfOnly,
}: {
  options: OptionsRecord;
  includeSelfOnly: boolean;
}): SpecRecord {
  const out: SpecRecord = {};
  for (const [name, opt] of Object.entries(options) as Array<[string, AnyOption]>) {
    if (!includeSelfOnly && opt.forwardToChildren !== true) {
      continue;
    }
    out[name] = {
      schema: opt.schema,
      ...(opt.required !== undefined && { required: opt.required }),
    };
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

function buildAliasMap(tree: RuntimeNode): Map<string, string> {
  const out = new Map<string, string>();
  function walk(node: RuntimeNode) {
    if (node.command) {
      for (const opt of node.command.optionNames) {
        for (const alias of opt.aliases ?? []) {
          out.set(alias, opt.name);
        }
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

/**
 * Rewrite alias tokens in argv to their canonical form before `parseArgs`.
 * Single-char aliases match `-x`; longer aliases match `--xxx`. `--alias=v`
 * and `--alias v` are both supported. Combined short forms (`-vfoo`) are
 * left untouched.
 */
function rewriteArgvAliases({
  argv,
  aliasMap,
}: {
  argv: string[];
  aliasMap: Map<string, string>;
}): string[] {
  if (aliasMap.size === 0) {
    return argv;
  }
  return argv.map((tok) => {
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const canonical = aliasMap.get(name);
      if (!canonical) {
        return tok;
      }
      return eq === -1 ? `--${canonical}` : `--${canonical}${tok.slice(eq)}`;
    }
    if (tok.length === 2 && tok.startsWith('-') && tok !== '--') {
      const canonical = aliasMap.get(tok.slice(1));
      if (canonical) {
        return `--${canonical}`;
      }
    }
    return tok;
  });
}

interface VisibleOption {
  source: string;
  meta: OptionMeta;
}

function detectAliasCollisions(tree: RuntimeNode): string[] {
  const issues: string[] = [];
  function visibleAt({
    node,
    inherited,
  }: {
    node: RuntimeNode;
    inherited: ReadonlyArray<VisibleOption>;
  }) {
    if (node.command) {
      const own: VisibleOption[] = node.command.optionNames.map((meta) => ({
        source: node.command!.path === '' ? '<root>' : node.command!.path,
        meta,
      }));
      const visible = [...inherited, ...own];
      const seen = new Map<string, VisibleOption>();
      for (const v of visible) {
        const ids = [v.meta.name, ...(v.meta.aliases ?? [])];
        for (const id of ids) {
          const prev = seen.get(id);
          if (prev && (prev.source !== v.source || prev.meta.name !== v.meta.name)) {
            issues.push(
              `option identifier '${id}' on ${v.source} (option '${v.meta.name}') collides with ${prev.source} (option '${prev.meta.name}')`,
            );
          } else {
            seen.set(id, v);
          }
        }
      }
    }
    let nextInherited = inherited;
    if (node.command) {
      const fwd = node.command.optionNames.filter((o) => o.forwardToChildren === true);
      if (fwd.length > 0) {
        nextInherited = [
          ...inherited,
          ...fwd.map((meta) => ({
            source: node.command!.path === '' ? '<root>' : node.command!.path,
            meta,
          })),
        ];
      }
    }
    for (const child of Object.values(node.literalChildren)) {
      visibleAt({ node: child, inherited: nextInherited });
    }
    if (node.paramChild) {
      visibleAt({ node: node.paramChild, inherited: nextInherited });
    }
  }
  visibleAt({ node: tree, inherited: [] });
  return issues;
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
  specs,
  values,
  kind,
}: {
  specs: SpecRecord;
  values: Record<string, unknown>;
  kind: 'option' | 'param';
}): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const raw = values[name];
    if (raw === undefined) {
      if (spec.required === true) {
        return { ok: false, error: `missing required ${kind}: ${name}` };
      }
      const settled = await settle({ schema: spec.schema, value: undefined });
      if ('issues' in settled && settled.issues) {
        return { ok: false, error: `missing required ${kind}: ${name}` };
      }
      out[name] = settled.value;
      continue;
    }
    const settled = await validateScalar({ schema: spec.schema, raw });
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
  hasVersion,
}: {
  root: RuntimeNode;
  programName: string;
  programDescription: string | undefined;
  hasVersion: boolean;
}): string {
  const lines: string[] = [];
  if (programDescription) {
    lines.push(programDescription, '');
  }
  lines.push(`${stdoutBold('Usage:')} ${programName} <command> [options]`, '');

  const rootOptions = root.command?.optionNames ?? [];
  const optionRows = rootOptions.map((o) => ({
    label: optionLabel(o),
    description: o.description,
  }));
  optionRows.push({ label: '--help, -h', description: 'Show this help message.' });
  if (hasVersion) {
    optionRows.push({ label: '--version, -V', description: 'Print the version and exit.' });
  }
  lines.push(stdoutBold('Options:'));
  for (const line of formatTwoColumn(optionRows)) {
    lines.push(`  ${line}`);
  }
  lines.push('');

  lines.push(stdoutBold('Commands:'));
  const rows: Array<{ label: string; description: string | undefined }> = [];
  function walk({ node, prefix }: { node: RuntimeNode; prefix: string[] }) {
    for (const [name, child] of Object.entries(node.literalChildren)) {
      const pieces = [...prefix, name];
      if (child.command && child.command.hidden !== true) {
        rows.push({ label: pieces.join(' '), description: child.command.description });
      }
      walk({ node: child, prefix: pieces });
    }
    if (node.paramChild) {
      const pc = node.paramChild;
      const segName = pc.segment?.kind === 'param' ? pc.segment.name : 'param';
      const pieces = [...prefix, `<${segName}>`];
      if (pc.command && pc.command.hidden !== true) {
        rows.push({ label: pieces.join(' '), description: pc.command.description });
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
  return rows.map((r) => {
    const padded = r.label.padEnd(width);
    const styled = stdoutCyan(padded);
    return r.description ? `${styled}  ${stdoutDim(r.description)}` : stdoutCyan(r.label);
  });
}

function optionLabel(meta: OptionMeta): string {
  const flag = `--${meta.name}`;
  const aliases = (meta.aliases ?? []).map((a) => (a.length === 1 ? `-${a}` : `--${a}`));
  return [flag, ...aliases].join(', ');
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
  lines.push(`${stdoutBold('Usage:')} ${programName} ${segments.join(' ')} [options]`, '');

  if (cmd.optionNames.length > 0) {
    lines.push(stdoutBold('Options:'));
    for (const line of formatTwoColumn(
      cmd.optionNames.map((o) => ({ label: optionLabel(o), description: o.description })),
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
      inheritedRows.push({ label: optionLabel(opt), description: descParts.join(' ') });
    }
  }
  if (inheritedRows.length > 0) {
    lines.push(stdoutBold('Inherited options:'));
    for (const line of formatTwoColumn(inheritedRows)) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  const visibleSubs = Object.keys(node.literalChildren)
    .sort()
    .filter((name) => node.literalChildren[name]!.command?.hidden !== true);
  const paramChildVisible =
    node.paramChild?.segment?.kind === 'param' && node.paramChild.command?.hidden !== true;
  if (visibleSubs.length > 0 || paramChildVisible) {
    lines.push(stdoutBold('Subcommands:'));
    const rows: Array<{ label: string; description: string | undefined }> = [];
    for (const name of visibleSubs) {
      const child = node.literalChildren[name]!;
      rows.push({ label: name, description: child.command?.description });
    }
    if (paramChildVisible && node.paramChild?.segment?.kind === 'param') {
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

function versionRequested(argv: string[]): boolean {
  return argv.includes('--version') || argv.includes('-V');
}

function helpHint(enabled: boolean): string {
  return enabled ? stderrDim(' — use --help or -h to see usage') : '';
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

type LifecycleResult = { ok: true } | { ok: false; error: unknown };

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
      return { ok: false, error };
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
  readonly #version: string | undefined;
  readonly #parseOptions: ParseArgsConfig['options'];
  readonly #aliasMap: Map<string, string>;
  readonly #context: CliContextInput | undefined;
  readonly #errors: ErrorsRecord;
  readonly #onError: OnError<ErrorsRecord, object> | undefined;

  constructor({
    programName,
    programDescription,
    tree,
    version,
    context,
    errors,
    onError,
  }: CreateCliOptions) {
    const issues = [...detectSameLevelCollisions(tree), ...detectAliasCollisions(tree)];
    if (issues.length > 0) {
      throw new Error(
        `${programName}: command tree has ${issues.length} issue(s):\n${issues.map((i) => `  - ${i}`).join('\n')}`,
      );
    }
    this.#tree = tree;
    this.#programName = programName;
    this.#programDescription = programDescription;
    this.#version = version;
    this.#parseOptions = collectParseOptions(tree);
    this.#aliasMap = buildAliasMap(tree);
    this.#context = context;
    this.#errors = (errors ?? {}) as ErrorsRecord;
    this.#onError = onError as OnError<ErrorsRecord, object> | undefined;
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
      hasVersion: this.#version !== undefined,
    });
  }

  async run(argv: string[]): Promise<number> {
    const rewritten = rewriteArgvAliases({ argv, aliasMap: this.#aliasMap });
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: rewritten,
        options: this.#parseOptions,
        strict: false,
        allowPositionals: true,
      });
    } catch (err) {
      return handleError({
        site: {
          code: BuiltInErrorCode.Parse,
          error: err as Error,
          defaultMessage: (err as Error).message,
          defaultExitCode: EXIT_USAGE,
        },
        programName: this.#programName,
        onError: this.#onError,
      });
    }

    if (
      this.#version !== undefined &&
      parsed.positionals.length === 0 &&
      versionRequested(rewritten)
    ) {
      process.stdout.write(`${this.#version}\n`);
      return 0;
    }

    const wantsHelp = helpRequested(rewritten);

    if (parsed.positionals.length === 0 && wantsHelp && !this.#tree.command) {
      process.stdout.write(`${this.#renderRootUsage()}\n`);
      return 0;
    }

    const { node, visitedCommands, unknown, unknownToken } = walkTree({
      tree: this.#tree,
      positionals: parsed.positionals,
    });

    if (unknown) {
      const msg = `unknown command: ${unknownToken} — run \`${this.#programName} --help\` to see available commands`;
      return handleError({
        site: {
          code: BuiltInErrorCode.Parse,
          error: new Error(msg),
          defaultMessage: msg,
          defaultExitCode: EXIT_USAGE,
        },
        programName: this.#programName,
        onError: this.#onError,
      });
    }

    if (!node.command) {
      process.stdout.write(`${this.#renderRootUsage()}\n`);
      return 0;
    }

    if (wantsHelp) {
      const usage =
        node === this.#tree
          ? this.#renderRootUsage()
          : renderCommandUsage({
              programName: this.#programName,
              node,
              visited: visitedCommands
                .map((v) => v.command)
                .filter((c): c is RuntimeCommand => c !== null),
            });
      process.stdout.write(`${usage}\n`);
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
        return handleError({
          site: {
            code: BuiltInErrorCode.Load,
            error: err,
            defaultMessage: err.message,
            defaultExitCode: EXIT_FAILURE,
          },
          programName: this.#programName,
          onError: this.#onError,
        });
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
      const optionSpecs = optionSpecsFor({
        options: loadedCmd.options,
        includeSelfOnly: isTargetVisit,
      });
      const optionsResult = await validateRecord({
        specs: optionSpecs,
        values: rawValues,
        kind: 'option',
      });
      if (!optionsResult.ok) {
        const msg = `${optionsResult.error}${helpHint(targetHelpEnabled)}`;
        return handleError({
          site: {
            code: BuiltInErrorCode.Validation,
            error: new Error(optionsResult.error),
            defaultMessage: msg,
            defaultExitCode: EXIT_USAGE,
          },
          programName: this.#programName,
          onError: this.#onError,
        });
      }

      const ownParamValues: Record<string, unknown> = {};
      const ownParamSpecs: SpecRecord = {};
      if (v.paramName) {
        const param: AnyParam | undefined = loadedCmd.params?.[v.paramName];
        if (param) {
          ownParamSpecs[v.paramName] = {
            schema: param.schema,
            ...(param.required !== undefined && { required: param.required }),
          };
          ownParamValues[v.paramName] = v.paramValue;
        }
      }
      const paramsResult = await validateRecord({
        specs: ownParamSpecs,
        values: ownParamValues,
        kind: 'param',
      });
      if (!paramsResult.ok) {
        const msg = `${paramsResult.error}${helpHint(targetHelpEnabled)}`;
        return handleError({
          site: {
            code: BuiltInErrorCode.Validation,
            error: new Error(paramsResult.error),
            defaultMessage: msg,
            defaultExitCode: EXIT_USAGE,
          },
          programName: this.#programName,
          onError: this.#onError,
        });
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
      options: targetOwnOptions,
      params: targetOwnParams,
      parents,
      rootOptions,
      print,
      context: resolvedContext,
    };

    if (!targetLoaded.handler) {
      const usage =
        node === this.#tree
          ? this.#renderRootUsage()
          : renderCommandUsage({
              programName: this.#programName,
              node,
              visited: visitedCmds,
            });
      process.stdout.write(`${usage}\n`);
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
    const raw: unknown = result.error;
    const errVal: Error = raw instanceof Error ? raw : new Error(String(raw));
    const matchedCode = matchRegisteredError({ error: errVal, errors: this.#errors });
    const errorCtx: OnErrorHandlerCtx = {
      options: ctx.options,
      params: ctx.params,
      parents: ctx.parents,
      rootOptions: ctx.rootOptions,
      print: ctx.print,
      context: ctx.context,
    };
    return handleError({
      site: {
        code: matchedCode ?? BuiltInErrorCode.Unknown,
        error: errVal,
        ctx: errorCtx,
        defaultMessage: errVal.message,
        defaultExitCode: EXIT_FAILURE,
      },
      programName: this.#programName,
      onError: this.#onError,
    });
  }

  async main(): Promise<never> {
    const code = await this.run(process.argv.slice(2));
    process.exit(code);
  }
}

export function createCli<
  const C extends CliContextInput | undefined = undefined,
  E extends ErrorsRecord = Record<string, never>,
>(options: CreateCliOptions<C, E>): Cli<ResolveContext<C>> {
  return new Cli(options as unknown as CreateCliOptions) as Cli<ResolveContext<C>>;
}
