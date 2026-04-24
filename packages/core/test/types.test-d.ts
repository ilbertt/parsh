import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { type CommandRegistry, defineCommand } from '#index.ts';

declare module '#index.ts' {
  interface CommandRegistry {
    deploy: {
      parents: {};
      root: { args: { verbose: boolean } };
    };
    users: {
      parents: {};
      root: { args: { verbose: boolean } };
    };
    'users create': {
      parents: { users: { args: { workspace: string }; params: {} } };
      root: { args: { verbose: boolean } };
    };
    'items [sku]': {
      parents: {};
      root: { args: { verbose: boolean } };
    };
    'items [sku] edit': {
      parents: { 'items [sku]': { args: { force: boolean }; params: { sku: string } } };
      root: { args: { verbose: boolean } };
    };
  }
}

defineCommand('deploy', {
  args: { env: z.enum(['staging', 'prod']) },
  handler: (ctx) => {
    expectTypeOf(ctx.args).toEqualTypeOf<{ env: 'staging' | 'prod' }>();
    expectTypeOf(ctx.params).toEqualTypeOf<Record<string, never>>();
    expectTypeOf<keyof typeof ctx.parents>().toBeNever();
    expectTypeOf(ctx.root.args).toEqualTypeOf<{ verbose: boolean }>();
  },
});

defineCommand('users', {
  args: { workspace: z.string() },
  handler: (ctx) => {
    expectTypeOf(ctx.args).toEqualTypeOf<{ workspace: string }>();
    expectTypeOf<keyof typeof ctx.parents>().toBeNever();
  },
});

defineCommand('users create', {
  args: { email: z.string() },
  handler: (ctx) => {
    expectTypeOf(ctx.args).toEqualTypeOf<{ email: string }>();
    expectTypeOf(ctx.parents.users.args).toEqualTypeOf<{ workspace: string }>();
    expectTypeOf<keyof (typeof ctx.parents)['users']['params']>().toBeNever();
    expectTypeOf(ctx.root.args.verbose).toEqualTypeOf<boolean>();
  },
});

defineCommand('items [sku]', {
  params: { sku: z.string() },
  args: { force: z.boolean() },
  handler: (ctx) => {
    expectTypeOf(ctx.params).toEqualTypeOf<{ sku: string }>();
    expectTypeOf(ctx.args).toEqualTypeOf<{ force: boolean }>();
  },
});

defineCommand('items [sku]', {
  // @ts-expect-error — `wrongName` is not the param the path declares
  params: { wrongName: z.string() },
  args: { force: z.boolean() },
  handler: () => {},
});

defineCommand('items [sku]', {
  // @ts-expect-error — path declares `[sku]` but params object is empty
  params: {},
  args: { force: z.boolean() },
  handler: () => {},
});

defineCommand('items [sku] edit', {
  args: { mode: z.enum(['basic', 'full']) },
  handler: (ctx) => {
    expectTypeOf(ctx.args).toEqualTypeOf<{ mode: 'basic' | 'full' }>();
    expectTypeOf(ctx.params).toEqualTypeOf<Record<string, never>>();
    expectTypeOf(ctx.parents['items [sku]'].args).toEqualTypeOf<{ force: boolean }>();
    expectTypeOf(ctx.parents['items [sku]'].params).toEqualTypeOf<{ sku: string }>();
  },
});

// @ts-expect-error — 'totally made up' is not a key in CommandRegistry
defineCommand('totally made up', { args: {}, handler: () => {} });

expectTypeOf<'totally made up path'>().not.toMatchTypeOf<keyof CommandRegistry>();
expectTypeOf<'users create'>().toMatchTypeOf<keyof CommandRegistry>();
