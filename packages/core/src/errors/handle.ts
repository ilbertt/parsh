import { print } from '../print.js';
import { stderrBold, stderrRed } from '../style.js';
import { EXIT_FAILURE } from './codes.js';
import { ExitSignal } from './exit.js';
import type { ErrorsRecord, OnError, OnErrorHandlerCtx, OnErrorReturn } from './types.js';

type AnyOnError = OnError<ErrorsRecord, object>;

export interface ErrorSite {
  code: string;
  error: Error;
  ctx?: OnErrorHandlerCtx;
  defaultMessage: string;
  defaultExitCode: number;
}

export function matchRegisteredError({
  error,
  errors,
}: {
  error: unknown;
  errors: ErrorsRecord;
}): string | undefined {
  for (const [code, cls] of Object.entries(errors)) {
    if (error instanceof cls) {
      return code;
    }
  }
  return undefined;
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
  onError: AnyOnError | undefined;
}): Promise<number> {
  const prefix = stderrRed(stderrBold(programName));
  if (onError) {
    let result: OnErrorReturn;
    try {
      result = await invokeOnError({ site, onError });
    } catch (cbErr) {
      const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
      process.stderr.write(`${prefix}: onError threw: ${msg}\n`);
      return EXIT_FAILURE;
    }
    if (result instanceof ExitSignal) {
      return result.code;
    }
  }
  process.stderr.write(`${prefix}: ${site.defaultMessage}\n`);
  return site.defaultExitCode;
}

async function invokeOnError({
  site,
  onError,
}: {
  site: ErrorSite;
  onError: AnyOnError;
}): Promise<OnErrorReturn> {
  const payload = {
    code: site.code,
    error: site.error,
    ctx: site.ctx,
    exit: (n: number) => new ExitSignal(n),
    print,
  };
  // The internal payload is a `code: string` shape; the public `OnErrorPayload`
  // is a discriminated union narrowed at the user's call site. The cast is
  // confined here.
  // biome-ignore lint/suspicious/noExplicitAny: see comment above
  const ret: OnErrorReturn | Promise<OnErrorReturn> = onError(payload as any);
  return ret instanceof Promise ? await ret : ret;
}
