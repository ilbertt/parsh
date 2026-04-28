import { type ParseArgsConfig, parseArgs } from 'node:util';
import { BuiltInErrorCode, EXIT_FAILURE, EXIT_USAGE } from '../errors/codes.js';
import {
  type ErrorsRecord,
  handleError,
  matchRegisteredError,
  type OnError,
  type OnErrorHandlerCtx,
} from '../errors/handle.js';
import { CommandLoadError } from '../errors/internal-errors.js';
import { print } from '../print.js';
import type { ResolveContext } from '../registry.js';
import type { AnyParam } from '../schema.js';
import {
  collectCandidatePositionals,
  helpHint,
  helpRequested,
  positionalsEqual,
  rewriteArgvAliases,
  versionRequested,
} from './argv.js';
import { detectOptionCollisions, detectParamOptionShadow } from './collisions.js';
import { runHandlerLifecycle } from './lifecycle.js';
import {
  buildAliasMapFromDescriptors,
  buildParserConfigFromDescriptors,
  collectDescriptors,
  optionSpecsFor,
} from './options.js';
import { validateRecord } from './schema-validate.js';
import {
  type LoadedCommand,
  loadCommand,
  type RuntimeCommand,
  type RuntimeNode,
  walkTree,
} from './tree.js';
import { renderCommandUsage, renderRootUsage } from './usage.js';

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
    this.#tree = tree;
    this.#programName = programName;
    this.#programDescription = programDescription;
    this.#version = version;
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
      const msg = `unknown command: ${walk.unknownToken} — run \`${this.#programName} --help\` to see available commands`;
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
      const parserConfig: ParseArgsConfig['options'] =
        buildParserConfigFromDescriptors(descriptorsForParse);
      const rewritten = rewriteArgvAliases({ argv, aliasMap });
      try {
        parsed = parseArgs({
          args: rewritten,
          options: parserConfig,
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
      const msg = `unknown command: ${walk.unknownToken} — run \`${this.#programName} --help\` to see available commands`;
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
      const msg = `${collisions.join('; ')}${helpHint(targetHelpEnabled)}`;
      return handleError({
        site: {
          code: BuiltInErrorCode.Validation,
          error: new Error(collisions.join('; ')),
          defaultMessage: msg,
          defaultExitCode: EXIT_USAGE,
        },
        programName: this.#programName,
        onError: this.#onError,
      });
    }

    const paramShadow = detectParamOptionShadow({
      visitedCommands: walk.visitedCommands,
      loaded,
    });
    if (paramShadow) {
      return handleError({
        site: {
          code: BuiltInErrorCode.Validation,
          error: new Error(paramShadow),
          defaultMessage: paramShadow,
          defaultExitCode: EXIT_USAGE,
        },
        programName: this.#programName,
        onError: this.#onError,
      });
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
      const ownParamSpecs: Record<string, { schema: AnyParam['schema']; required?: boolean }> = {};
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
