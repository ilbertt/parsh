/** biome-ignore-all lint/performance/noBarrelFile: index is the only allowed file where we can re-export */

export { BuiltInErrorCode, EXIT_FAILURE, EXIT_USAGE } from './codes.js';
export { type ExitFn, ExitSignal } from './exit.js';
export { type ErrorSite, handleError, matchRegisteredError } from './handle.js';
export { CommandLoadError } from './load-error.js';
export type {
  ErrorClass,
  ErrorsRecord,
  OnError,
  OnErrorHandlerCtx,
  OnErrorPayload,
  OnErrorReturn,
} from './types.js';
