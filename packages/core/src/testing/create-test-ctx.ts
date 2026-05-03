import type { DefinedCommand, DefinedRootCommand, HandlerCtx, RootHandlerCtx } from '../command.js';
import type { Print } from '../print.js';
import type { CommandRegistry } from '../registry.js';
import type { AnyParam, OptionsRecord } from '../schema.js';

const silentPrint: Print = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  dim: () => {},
};

type CtxFields<
  P extends keyof CommandRegistry,
  Options extends OptionsRecord,
  Params extends Record<string, AnyParam>,
> = Omit<HandlerCtx<P, Options, Params>, 'print' | 'parents' | 'rootOptions'> & {
  parents?: HandlerCtx<P, Options, Params>['parents'];
  rootOptions?: HandlerCtx<P, Options, Params>['rootOptions'];
  /**
   * Partial — channels you don't supply default to a silent no-op so handlers
   * can call `ctx.print.success(...)` without crashing. Pass spies only for
   * the channels you assert against.
   */
  print?: Partial<Print>;
};

type RootCtxFields<Options extends OptionsRecord> = Omit<RootHandlerCtx<Options>, 'print'> & {
  print?: Partial<Print>;
};

export function createTestCtx<Options extends OptionsRecord>(
  input: { cmd: DefinedRootCommand<Options> } & RootCtxFields<Options>,
): RootHandlerCtx<Options>;
export function createTestCtx<
  P extends keyof CommandRegistry,
  Options extends OptionsRecord,
  Params extends Record<string, AnyParam>,
>(
  input: { cmd: DefinedCommand<P, Options, Params> } & CtxFields<P, Options, Params>,
): HandlerCtx<P, Options, Params>;
export function createTestCtx(input: { cmd: object } & Record<string, unknown>): object {
  const { cmd: _cmd, print, ...rest } = input;
  return {
    parents: {},
    rootOptions: {},
    ...rest,
    print: { ...silentPrint, ...((print as Partial<Print> | undefined) ?? {}) },
  };
}
