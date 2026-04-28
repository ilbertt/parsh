/** biome-ignore-all lint/performance/noBarrelFile: index is the only allowed file where we can export other files */

export {
  Cli,
  type CliContextInput,
  createCli,
  type LoadedCommand,
  type OptionMeta,
  type RuntimeCommand,
  type RuntimeNode,
} from './cli.js';
export { defineCommand, defineRootCommand } from './command.js';
export {
  BuiltInErrorCode,
  CommandLoadError,
  type ErrorClass,
  type ErrorsRecord,
  type ExitFn,
  ExitSignal,
  type OnError,
  type OnErrorHandlerCtx,
  type OnErrorPayload,
} from './errors/index.js';
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
