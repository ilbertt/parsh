import type { Print } from './print.js';
import { stderrBold, stderrRed } from './style.js';

export type BuiltInErrorCode = 'PARSE' | 'VALIDATION' | 'LOAD' | 'UNKNOWN';

type ReservedCodeMessage<K extends string> =
  `'${K}' is a built-in error code and cannot be used as a custom error code`;

export interface ErrorClass {
  new (...args: never[]): Error;
  readonly code: string;
}

export type ErrorsRecord = Record<string, ErrorClass>;

export type ValidateErrorsRecord<E extends ErrorsRecord> = {
  [K in keyof E]: E[K]['code'] extends BuiltInErrorCode
    ? ReservedCodeMessage<E[K]['code'] & string>
    : E[K];
};

export interface OnErrorHandlerCtx<C extends object = object> {
  options: Record<string, unknown>;
  params: Record<string, unknown>;
  parents: Record<string, { options: Record<string, unknown>; params: Record<string, unknown> }>;
  rootOptions: Record<string, unknown>;
  print: Print;
  context: C;
}

type RegisteredVariants<E extends ErrorsRecord, C extends object> = {
  [K in keyof E & string]: {
    code: E[K]['code'];
    error: InstanceType<E[K]>;
    ctx: OnErrorHandlerCtx<C>;
  };
}[keyof E & string];

export type OnErrorPayload<E extends ErrorsRecord, C extends object> =
  | { code: 'PARSE'; error: Error; ctx?: undefined }
  | { code: 'VALIDATION'; error: Error; ctx?: undefined }
  | { code: 'LOAD'; error: CommandLoadError; ctx?: undefined }
  | { code: 'UNKNOWN'; error: unknown; ctx: OnErrorHandlerCtx<C> }
  | RegisteredVariants<E, C>;

export class ExitSignal {
  readonly code: number;
  constructor(code: number) {
    this.code = code;
  }
}

export type ExitFn = (code: number) => ExitSignal;

// biome-ignore lint/suspicious/noConfusingVoidType: callbacks with no explicit return must satisfy this type
export type OnErrorReturn = ExitSignal | void;

export type OnError<E extends ErrorsRecord, C extends object> = (
  payload: OnErrorPayload<E, C> & { exit: ExitFn },
) => OnErrorReturn | Promise<OnErrorReturn>;

export class CommandLoadError extends Error {
  static readonly code = 'LOAD' as const;
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

export function matchRegisteredError({
  error,
  errors,
}: {
  error: unknown;
  errors: ErrorsRecord;
}): string | null {
  for (const cls of Object.values(errors)) {
    if (error instanceof cls) {
      return cls.code;
    }
  }
  return null;
}

export interface ErrorSite {
  code: string;
  error: unknown;
  ctx?: OnErrorHandlerCtx;
  defaultMessage: string;
  defaultExitCode: number;
}

/**
 * Routes an error site through the user's `onError` (if any), honouring
 * `exit(n)` returns and falling through to a default `${prefix}: ${msg}`
 * stderr write otherwise. Throws inside the user callback are caught and
 * surfaced as a single line — no recursion.
 */
export async function handleError({
  site,
  programName,
  onError,
}: {
  site: ErrorSite;
  programName: string;
  onError: OnError<ErrorsRecord, object> | undefined;
}): Promise<number> {
  const prefix = stderrRed(stderrBold(programName));
  if (onError) {
    let result: OnErrorReturn;
    try {
      const payload = {
        code: site.code,
        error: site.error,
        ctx: site.ctx,
        exit: (n: number) => new ExitSignal(n),
      };
      // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch across the discriminated union
      const ret: OnErrorReturn | Promise<OnErrorReturn> = onError(payload as any);
      result = ret instanceof Promise ? await ret : ret;
    } catch (cbErr) {
      const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
      process.stderr.write(`${prefix}: onError threw: ${msg}\n`);
      return 1;
    }
    if (result instanceof ExitSignal) {
      return result.code;
    }
  }
  process.stderr.write(`${prefix}: ${site.defaultMessage}\n`);
  return site.defaultExitCode;
}
