import { type ParseArgsConfig, parseArgs } from 'node:util';
import { print } from './print.js';
import type { ResolveContext } from './registry.js';
import type { AnyOption, AnyParam, AnySchema, OptionsRecord, ParamsRecord } from './schema.js';
import { stderrBold, stderrDim, stderrRed, stdoutBold, stdoutCyan, stdoutDim } from './style.js';

type TreeSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

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

interface CreateCliOptions<C extends CliContextInput | undefined = CliContextInput | undefined> {
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

/**
 * Greedy scan to recover candidate positionals before the target chain is
 * loaded. parseArgs needs option types up-front to disambiguate `--foo bar`,
 * but we don't know option types until the chain is loaded, and we need
 * positionals to find the chain. The greedy assumption — every `--flag` /
 * `-x` token consumes the next token as its value — is right for value-taking
 * flags and wrong for booleans. After loading and running `parseArgs` with
 * real types, the resulting positionals are authoritative and we re-walk if
 * they differ.
 *
 * Tokens of shape `--name=value` consume nothing extra. Single `--` ends the
 * scan; everything after is positional. Combined short forms like `-abc`
 * are treated as a single flag-with-value-taking-next, which is wrong for
 * boolean clusters but harmless because `parseArgs` corrects later.
 */
function collectCandidatePositionals(argv: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok === '--') {
      for (let j = i + 1; j < argv.length; j++) {
        out.push(argv[j]!);
      }
      return out;
    }
    if (tok.length > 1 && tok.startsWith('-')) {
      if (tok.startsWith('--') && tok.includes('=')) {
        i += 1;
      } else {
        i += 2;
      }
      continue;
    }
    out.push(tok);
    i += 1;
  }
  return out;
}

async function probeAccepts({
  schema,
  value,
}: {
  schema: AnySchema;
  value: unknown;
}): Promise<boolean> {
  const r = schema['~standard'].validate(value);
  const settled = r instanceof Promise ? await r : r;
  return !('issues' in settled && settled.issues);
}

interface ParserShape {
  type: 'boolean' | 'string';
  multiple?: boolean;
}

/**
 * Determine how `parseArgs` should treat an option, by probing its schema.
 *
 * 1. If it accepts an array (`[]`, `['x']`, `[0]`), the flag is repeatable
 *    (`--header A --header B` → `['A', 'B']`).
 * 2. Else if it accepts `true` but rejects an arbitrary string, the flag is
 *    boolean (consumes no value).
 * 3. Otherwise, the flag is a single-value string. Numeric/enum schemas land
 *    here; argv is always a string and `validateScalar` retries with numeric
 *    coercion later.
 */
async function inferOptionParserShape(schema: AnySchema): Promise<ParserShape> {
  if (await probeAccepts({ schema, value: [] })) {
    return { type: 'string', multiple: true };
  }
  if (await probeAccepts({ schema, value: ['__parsh_probe__'] })) {
    return { type: 'string', multiple: true };
  }
  if (await probeAccepts({ schema, value: [0] })) {
    return { type: 'string', multiple: true };
  }
  if (await probeAccepts({ schema, value: true })) {
    if (!(await probeAccepts({ schema, value: '__parsh_probe__' }))) {
      return { type: 'boolean' };
    }
  }
  return { type: 'string' };
}

interface OptionDescriptor {
  name: string;
  shape: ParserShape;
  forwardToChildren: boolean;
  description?: string;
  aliases: ReadonlyArray<string>;
  source: string;
}

async function describeLoadedOptions({
  options,
  source,
}: {
  options: OptionsRecord;
  source: string;
}): Promise<OptionDescriptor[]> {
  const out: OptionDescriptor[] = [];
  for (const [name, opt] of Object.entries(options) as Array<[string, AnyOption]>) {
    const shape = await inferOptionParserShape(opt.schema);
    out.push({
      name,
      shape,
      forwardToChildren: opt.forwardToChildren === true,
      ...(opt.description !== undefined ? { description: opt.description } : {}),
      aliases: opt.aliases ?? [],
      source,
    });
  }
  return out;
}

function buildParserConfigFromDescriptors(
  descriptors: ReadonlyArray<OptionDescriptor>,
): ParseArgsConfig['options'] {
  const out: NonNullable<ParseArgsConfig['options']> = {};
  for (const d of descriptors) {
    out[d.name] = d.shape.multiple ? { type: 'string', multiple: true } : { type: d.shape.type };
  }
  return out;
}

function buildAliasMapFromDescriptors(
  descriptors: ReadonlyArray<OptionDescriptor>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of descriptors) {
    for (const alias of d.aliases) {
      out.set(alias, d.name);
    }
  }
  return out;
}

function detectParamOptionShadow({
  visitedCommands,
  loaded,
}: {
  visitedCommands: ReadonlyArray<Visited>;
  loaded: Map<RuntimeCommand, LoadedCommand>;
}): string | null {
  for (const v of visitedCommands) {
    if (!v.command || !v.paramName) {
      continue;
    }
    const lc = loaded.get(v.command);
    if (!lc) {
      continue;
    }
    if (Object.hasOwn(lc.options, v.paramName)) {
      const path = v.command.path === '' ? '(root)' : v.command.path;
      return `command ${path} declares option "${v.paramName}" that shadows its own param [${v.paramName}]`;
    }
  }
  return null;
}

function detectOptionCollisions(descriptors: ReadonlyArray<OptionDescriptor>): string[] {
  const issues: string[] = [];
  const seenIds = new Map<string, OptionDescriptor>();
  const seenNames = new Map<string, OptionDescriptor>();
  for (const d of descriptors) {
    const prevName = seenNames.get(d.name);
    if (prevName && prevName.source !== d.source) {
      issues.push(
        `option '${d.name}' on ${d.source} collides with ancestor option '${d.name}' on ${prevName.source}`,
      );
      continue;
    }
    seenNames.set(d.name, d);
    const ids = [d.name, ...d.aliases];
    for (const id of ids) {
      const prev = seenIds.get(id);
      if (prev && (prev.source !== d.source || prev.name !== d.name)) {
        issues.push(
          `option identifier '${id}' on ${d.source} (option '${d.name}') collides with ${prev.source} (option '${prev.name}')`,
        );
      } else {
        seenIds.set(id, d);
      }
    }
  }
  return issues;
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

async function renderRootUsage({
  root,
  programName,
  programDescription,
  hasVersion,
  loadedRoot,
}: {
  root: RuntimeNode;
  programName: string;
  programDescription: string | undefined;
  hasVersion: boolean;
  loadedRoot: LoadedCommand | null;
}): Promise<string> {
  const lines: string[] = [];
  if (programDescription) {
    lines.push(programDescription, '');
  }
  lines.push(`${stdoutBold('Usage:')} ${programName} <command> [options]`, '');

  const rootDescriptors = loadedRoot
    ? await describeLoadedOptions({ options: loadedRoot.options, source: '<root>' })
    : [];
  const optionRows = rootDescriptors.map((d) => ({
    label: optionLabel(d),
    description: d.description,
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

function optionLabel(d: { name: string; aliases?: ReadonlyArray<string> }): string {
  const flag = `--${d.name}`;
  const aliases = (d.aliases ?? []).map((a) => (a.length === 1 ? `-${a}` : `--${a}`));
  return [flag, ...aliases].join(', ');
}

async function renderCommandUsage({
  programName,
  node,
  visited,
  loaded,
}: {
  programName: string;
  node: RuntimeNode;
  visited: ReadonlyArray<RuntimeCommand>;
  loaded: Map<RuntimeCommand, LoadedCommand>;
}): Promise<string> {
  const cmd = node.command!;
  const segments = cmd.path.split(' ').map((s) => (s.startsWith('[') ? `<${s.slice(1, -1)}>` : s));
  const lines: string[] = [];
  if (cmd.description) {
    lines.push(cmd.description, '');
  }
  lines.push(`${stdoutBold('Usage:')} ${programName} ${segments.join(' ')} [options]`, '');

  const targetLoaded = loaded.get(cmd);
  const ownDescriptors = targetLoaded
    ? await describeLoadedOptions({
        options: targetLoaded.options,
        source: cmd.path === '' ? '<root>' : cmd.path,
      })
    : [];
  if (ownDescriptors.length > 0) {
    lines.push(stdoutBold('Options:'));
    for (const line of formatTwoColumn(
      ownDescriptors.map((d) => ({ label: optionLabel(d), description: d.description })),
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
    const ancLoaded = loaded.get(v);
    if (!ancLoaded) {
      continue;
    }
    const from = v.path === '' ? '<root>' : v.path;
    const ancDescriptors = await describeLoadedOptions({
      options: ancLoaded.options,
      source: from,
    });
    for (const d of ancDescriptors) {
      if (!d.forwardToChildren) {
        continue;
      }
      const descParts = [d.description, `(inherited from ${from})`].filter(Boolean);
      inheritedRows.push({ label: optionLabel(d), description: descParts.join(' ') });
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

function positionalsEqual({
  a,
  b,
}: {
  a: ReadonlyArray<string>;
  b: ReadonlyArray<string>;
}): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function collectDescriptors({
  visitedCmds,
  node,
  loaded,
}: {
  visitedCmds: ReadonlyArray<RuntimeCommand>;
  node: RuntimeNode;
  loaded: Map<RuntimeCommand, LoadedCommand>;
}): Promise<OptionDescriptor[]> {
  const out: OptionDescriptor[] = [];
  for (const cmd of visitedCmds) {
    const lc = loaded.get(cmd);
    if (!lc) {
      continue;
    }
    const isTarget = cmd === node.command;
    const sliced: OptionsRecord = {};
    for (const [name, opt] of Object.entries(lc.options) as Array<[string, AnyOption]>) {
      if (isTarget || opt.forwardToChildren === true) {
        sliced[name] = opt;
      }
    }
    const ds = await describeLoadedOptions({
      options: sliced,
      source: cmd.path === '' ? '<root>' : cmd.path,
    });
    out.push(...ds);
  }
  return out;
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
  readonly #version: string | undefined;
  readonly #context: CliContextInput | undefined;

  constructor({ programName, programDescription, tree, version, context }: CreateCliOptions) {
    this.#tree = tree;
    this.#programName = programName;
    this.#programDescription = programDescription;
    this.#version = version;
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

  async #renderRootUsage(): Promise<string> {
    const rootCmd = this.#tree.command;
    let loadedRoot: LoadedCommand | null = null;
    if (rootCmd) {
      try {
        loadedRoot = await loadCommand(rootCmd);
      } catch {
        // Help should still render even if the root command fails to load.
        loadedRoot = null;
      }
    }
    return renderRootUsage({
      root: this.#tree,
      programName: this.#programName,
      programDescription: this.#programDescription,
      hasVersion: this.#version !== undefined,
      loadedRoot,
    });
  }

  #errorPrefix(): string {
    return stderrRed(stderrBold(this.#programName));
  }

  async run(argv: string[]): Promise<number> {
    const wantsHelp = helpRequested(argv);
    const wantsVersion = versionRequested(argv);

    let positionals = collectCandidatePositionals(argv);

    if (this.#version !== undefined && positionals.length === 0 && wantsVersion) {
      process.stdout.write(`${this.#version}\n`);
      return 0;
    }

    let walk = walkTree({ tree: this.#tree, positionals });

    // No flags in argv means greedy candidates equal the real positionals;
    // an unknown is genuine and we can bail without loading anything.
    const hasFlag = argv.some((t) => t.length > 1 && t.startsWith('-'));
    if (walk.unknown && !wantsHelp && !hasFlag) {
      process.stderr.write(
        `${this.#errorPrefix()}: unknown command: ${walk.unknownToken} — run \`${this.#programName} --help\` to see available commands\n`,
      );
      return 2;
    }

    let visitedCmds = walk.visitedCommands
      .map((v) => v.command)
      .filter((c): c is RuntimeCommand => c !== null);
    const loaded = new Map<RuntimeCommand, LoadedCommand>();
    let parsed: ReturnType<typeof parseArgs> | null = null;

    // Two-phase parse: greedy candidates resolved a tentative chain; loading
    // gives us real schemas, then `parseArgs` runs against those schemas and
    // its positionals are authoritative. If they differ from the candidates
    // the chain may also differ, so re-walk + re-parse. Stable after at most
    // a handful of iterations; cap defensively.
    const MAX_PARSE_ITERATIONS = 4;
    for (let iter = 0; iter < MAX_PARSE_ITERATIONS; iter++) {
      try {
        await Promise.all(
          visitedCmds.map(async (c) => {
            if (!loaded.has(c)) {
              loaded.set(c, await loadCommand(c));
            }
          }),
        );
      } catch (err) {
        if (err instanceof CommandLoadError) {
          process.stderr.write(`${this.#errorPrefix()}: ${err.message}\n`);
          return 1;
        }
        throw err;
      }

      if (wantsHelp) {
        const usage =
          walk.node === this.#tree || !walk.node.command
            ? await this.#renderRootUsage()
            : await renderCommandUsage({
                programName: this.#programName,
                node: walk.node,
                visited: visitedCmds,
                loaded,
              });
        process.stdout.write(`${usage}\n`);
        return 0;
      }

      if (!walk.node.command && !walk.unknown) {
        process.stdout.write(`${await this.#renderRootUsage()}\n`);
        return 0;
      }

      const descriptorsForParse = await collectDescriptors({
        visitedCmds,
        node: walk.node,
        loaded,
      });
      const aliasMap = buildAliasMapFromDescriptors(descriptorsForParse);
      const parserConfig = buildParserConfigFromDescriptors(descriptorsForParse);
      const rewritten = rewriteArgvAliases({ argv, aliasMap });
      try {
        parsed = parseArgs({
          args: rewritten,
          options: parserConfig,
          strict: false,
          allowPositionals: true,
        });
      } catch (err) {
        process.stderr.write(`${this.#errorPrefix()}: ${(err as Error).message}\n`);
        return 2;
      }

      if (positionalsEqual({ a: parsed.positionals, b: positionals })) {
        break;
      }
      positionals = parsed.positionals;
      walk = walkTree({ tree: this.#tree, positionals });
      visitedCmds = walk.visitedCommands
        .map((v) => v.command)
        .filter((c): c is RuntimeCommand => c !== null);
    }

    if (walk.unknown) {
      process.stderr.write(
        `${this.#errorPrefix()}: unknown command: ${walk.unknownToken} — run \`${this.#programName} --help\` to see available commands\n`,
      );
      return 2;
    }

    if (!walk.node.command) {
      process.stdout.write(`${await this.#renderRootUsage()}\n`);
      return 0;
    }

    const targetLoaded = loaded.get(walk.node.command)!;
    const targetHelpEnabled = targetLoaded.helpArg?.enabled !== false;

    const descriptors = await collectDescriptors({
      visitedCmds,
      node: walk.node,
      loaded,
    });

    const collisions = detectOptionCollisions(descriptors);
    if (collisions.length > 0) {
      process.stderr.write(
        `${this.#errorPrefix()}: ${collisions.join('; ')}${helpHint(targetHelpEnabled)}\n`,
      );
      return 2;
    }

    const paramShadow = detectParamOptionShadow({
      visitedCommands: walk.visitedCommands,
      loaded,
    });
    if (paramShadow) {
      process.stderr.write(`${this.#errorPrefix()}: ${paramShadow}\n`);
      return 2;
    }

    const rawValues = (parsed?.values ?? {}) as Record<string, unknown>;
    const rootCommand = this.#tree.command;

    const parents: Record<
      string,
      { options: Record<string, unknown>; params: Record<string, unknown> }
    > = {};
    let rootOptions: Record<string, unknown> = {};
    let targetOwnOptions: Record<string, unknown> = {};
    let targetOwnParams: Record<string, unknown> = {};

    for (let i = 0; i < walk.visitedCommands.length; i++) {
      const v = walk.visitedCommands[i]!;
      if (!v.command) {
        continue;
      }
      const loadedCmd = loaded.get(v.command)!;
      const isTargetVisit = i === walk.visitedCommands.length - 1;
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
        process.stderr.write(
          `${this.#errorPrefix()}: ${optionsResult.error}${helpHint(targetHelpEnabled)}\n`,
        );
        return 2;
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
        process.stderr.write(
          `${this.#errorPrefix()}: ${paramsResult.error}${helpHint(targetHelpEnabled)}\n`,
        );
        return 2;
      }

      const isTarget = i === walk.visitedCommands.length - 1;
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
        walk.node === this.#tree
          ? await this.#renderRootUsage()
          : await renderCommandUsage({
              programName: this.#programName,
              node: walk.node,
              visited: visitedCmds,
              loaded,
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
    process.stderr.write(`${this.#errorPrefix()}: ${result.error.message}\n`);
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
