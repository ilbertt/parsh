import type { Print } from '../print.js';
import type { BuiltInErrorCode } from './codes.js';
import type { ExitFn, ExitSignal } from './exit.js';
import type { CommandLoadError } from './load-error.js';

export type ErrorClass = new (...args: never[]) => Error;

export type ErrorsRecord = Record<string, ErrorClass>;

export interface OnErrorHandlerCtx<C extends object = object> {
  options: Record<string, unknown>;
  params: Record<string, unknown>;
  parents: Record<string, { options: Record<string, unknown>; params: Record<string, unknown> }>;
  rootOptions: Record<string, unknown>;
  print: Print;
  context: C;
}

type RegisteredVariants<E extends ErrorsRecord, C extends object> = string extends keyof E
  ? never
  : {
      [K in keyof E & string]: {
        code: K;
        error: InstanceType<E[K]>;
        ctx: OnErrorHandlerCtx<C>;
      };
    }[keyof E & string];

export type OnErrorPayload<E extends ErrorsRecord, C extends object> =
  | { code: BuiltInErrorCode.Parse; error: Error; ctx?: undefined }
  | { code: BuiltInErrorCode.Validation; error: Error; ctx?: undefined }
  | { code: BuiltInErrorCode.Load; error: CommandLoadError; ctx?: undefined }
  | { code: BuiltInErrorCode.Unknown; error: Error; ctx: OnErrorHandlerCtx<C> }
  | RegisteredVariants<E, C>;

// biome-ignore lint/suspicious/noConfusingVoidType: callbacks with no explicit return must satisfy this type
export type OnErrorReturn = ExitSignal | void;

export type OnError<E extends ErrorsRecord, C extends object> = (
  payload: OnErrorPayload<E, C> & { exit: ExitFn; print: Print },
) => OnErrorReturn | Promise<OnErrorReturn>;
