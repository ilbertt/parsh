/** biome-ignore-all lint/performance/noBarrelFile: index is the only allowed file where we can export other files */

export { Cli, type CliContextInput, createCli } from './cli/runner.js';
export type { LoadedCommand, RuntimeCommand, RuntimeNode } from './cli/tree.js';
export { defineCommand, defineRootCommand } from './command.js';
export { BuiltInErrorCode } from './errors/codes.js';
export { type ExitFn, ExitSignal } from './errors/exit.js';
export type {
  ErrorClass,
  ErrorsRecord,
  OnError,
  OnErrorHandlerCtx,
  OnErrorPayload,
} from './errors/handle.js';
export { CommandLoadError } from './errors/internal-errors.js';
export type { Print } from './print.js';
export type { CommandRegistry, Register, RegisteredContext, ResolveContext } from './registry.js';
export type {
  AnyOption,
  AnyParam,
  CommandOption,
  CommandParam,
  InferForwardedOptions,
  InferOptions,
  InferParams,
  InferSchemas,
  OptionsRecord,
  ParamsRecord,
} from './schema.js';
