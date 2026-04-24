import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { type CommandRegistry, defineCommand } from '#index.ts';

type Log = { info(msg: string): void };
// biome-ignore lint/complexity/noBannedTypes: spec-mandated empty params shape
type NoParams = { params: {}; inheritedParams: {} };

declare module '#index.ts' {
  interface CommandRegistry {
    deploy: {
      own: { env: 'staging' | 'prod' };
      inherited: { verbose: boolean };
      ctx: { log: Log };
    } & NoParams;
    users: {
      own: { workspace: string };
      inherited: { verbose: boolean };
      ctx: { log: Log };
    } & NoParams;
    'users create': {
      own: { email: string };
      inherited: { workspace: string; verbose: boolean };
      ctx: { log: Log };
    } & NoParams;
    'users list': {
      own: { limit: number };
      inherited: { workspace: string; verbose: boolean };
      ctx: { log: Log };
    } & NoParams;
    'items [sku]': {
      own: { force: boolean };
      inherited: { verbose: boolean };
      ctx: { log: Log };
      params: { sku: string };
      // biome-ignore lint/complexity/noBannedTypes: spec-mandated empty-object shape
      inheritedParams: {};
    };
    'items [sku] edit': {
      own: { mode: 'basic' | 'full' };
      inherited: { force: boolean; verbose: boolean };
      ctx: { log: Log };
      // biome-ignore lint/complexity/noBannedTypes: spec-mandated empty-object shape
      params: {};
      inheritedParams: { sku: string };
    };
  }
}

const deployCmd = defineCommand('deploy', {
  args: { env: z.enum(['staging', 'prod']) },
  handler: (ctx) => {
    ctx.log.info(`env=${ctx.args.env} verbose=${ctx.args.verbose}`);
  },
});
type CtxOf<T> = T extends { handler?: (ctx: infer C) => unknown } ? C : never;

expectTypeOf<CtxOf<typeof deployCmd>['args']>().toEqualTypeOf<{
  env: 'staging' | 'prod';
  verbose: boolean;
}>();
expectTypeOf<CtxOf<typeof deployCmd>['args']>().not.toHaveProperty('workspace');
// biome-ignore lint/complexity/noBannedTypes: asserting the exact empty-object type
expectTypeOf<CtxOf<typeof deployCmd>['params']>().toEqualTypeOf<{}>();

const usersCreateCmd = defineCommand('users create', {
  args: { email: z.string() },
  handler: (ctx) => {
    ctx.log.info(`create ${ctx.args.email} in ${ctx.args.workspace}`);
  },
});
expectTypeOf<CtxOf<typeof usersCreateCmd>['args']>().toEqualTypeOf<{
  email: string;
  workspace: string;
  verbose: boolean;
}>();

defineCommand('users', {
  args: { workspace: z.string() },
  handler: (ctx) => {
    ctx.log.info(ctx.args.workspace);
    // @ts-expect-error — reading an arg that belongs to a child is not allowed
    ctx.args.email;
  },
});

// positive
defineCommand('items [sku]', {
  params: { sku: z.string() },
  args: { force: z.boolean() },
  handler: (ctx) => {
    ctx.log.info(`${ctx.params.sku} ${ctx.args.force}`);
  },
});

// wrong key
defineCommand('items [sku]', {
  // @ts-expect-error — `wrongName` is not the param the path declares
  params: { wrongName: z.string() },
  args: { force: z.boolean() },
  handler: () => {},
});

// missing key
defineCommand('items [sku]', {
  // @ts-expect-error — path declares `[sku]` but params object is empty
  params: {},
  args: { force: z.boolean() },
  handler: () => {},
});

// extra key
defineCommand('items [sku]', {
  // @ts-expect-error — `extra` is not declared in the path
  params: { sku: z.string(), extra: z.string() },
  args: { force: z.boolean() },
  handler: () => {},
});

const itemsEditCmd = defineCommand('items [sku] edit', {
  args: { mode: z.enum(['basic', 'full']) },
  handler: (ctx) => ctx.log.info(`${ctx.params.sku}/${ctx.args.mode}`),
});
expectTypeOf<CtxOf<typeof itemsEditCmd>['params']>().toEqualTypeOf<{ sku: string }>();
expectTypeOf<CtxOf<typeof itemsEditCmd>['args']>().toEqualTypeOf<{
  mode: 'basic' | 'full';
  force: boolean;
  verbose: boolean;
}>();

// @ts-expect-error — 'totally made up' is not a key in CommandRegistry
defineCommand('totally made up', { args: {}, handler: () => {} });

expectTypeOf<'totally made up path'>().not.toMatchTypeOf<keyof CommandRegistry>();
expectTypeOf<'users create'>().toMatchTypeOf<keyof CommandRegistry>();

defineCommand('deploy', {
  args: { env: z.enum(['staging', 'prod']) },
  handler: (ctx) => {
    // @ts-expect-error — `madeUp` doesn't exist on ctx.args
    ctx.args.madeUp;
  },
});

defineCommand('items [sku] edit', {
  args: { mode: z.enum(['basic', 'full']) },
  handler: (ctx) => {
    // @ts-expect-error — `madeUp` doesn't exist on ctx.params
    ctx.params.madeUp;
  },
});
