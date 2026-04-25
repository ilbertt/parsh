/** biome-ignore-all lint/complexity/noBannedTypes: empty-object shapes mirror the generated registry */
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { type CommandRegistry, defineCommand } from '#index.ts';

declare module '#index.ts' {
  interface CommandRegistry {
    deploy: {
      parents: {};
      root: { options: { verbose: boolean } };
    };
    users: {
      parents: {};
      root: { options: { verbose: boolean } };
    };
    'users create': {
      parents: { users: { options: { workspace: string }; params: {} } };
      root: { options: { verbose: boolean } };
    };
    'items [sku]': {
      parents: {};
      root: { options: { verbose: boolean } };
    };
    'items [sku] edit': {
      parents: { 'items [sku]': { options: { force: boolean }; params: { sku: string } } };
      root: { options: { verbose: boolean } };
    };
  }
}

defineCommand('deploy', {
  options: { env: z.enum(['staging', 'prod']) },
  handler: (ctx) => {
    expectTypeOf(ctx.options).toEqualTypeOf<{ env: 'staging' | 'prod' }>();
    expectTypeOf(ctx.params).toEqualTypeOf<Record<string, never>>();
    expectTypeOf<keyof typeof ctx.parents>().toBeNever();
    expectTypeOf(ctx.root.options).toEqualTypeOf<{ verbose: boolean }>();
  },
});

defineCommand('users', {
  options: { workspace: z.string() },
  handler: (ctx) => {
    expectTypeOf(ctx.options).toEqualTypeOf<{ workspace: string }>();
    expectTypeOf<keyof typeof ctx.parents>().toBeNever();
  },
});

defineCommand('users create', {
  options: { email: z.string() },
  handler: (ctx) => {
    expectTypeOf(ctx.options).toEqualTypeOf<{ email: string }>();
    expectTypeOf(ctx.parents.users.options).toEqualTypeOf<{ workspace: string }>();
    expectTypeOf<keyof (typeof ctx.parents)['users']['params']>().toBeNever();
    expectTypeOf(ctx.root.options.verbose).toEqualTypeOf<boolean>();
  },
});

defineCommand('items [sku]', {
  params: { sku: z.string() },
  options: { force: z.boolean() },
  handler: (ctx) => {
    expectTypeOf(ctx.params).toEqualTypeOf<{ sku: string }>();
    expectTypeOf(ctx.options).toEqualTypeOf<{ force: boolean }>();
  },
});

defineCommand('items [sku]', {
  // @ts-expect-error — `wrongName` is not the param the path declares
  params: { wrongName: z.string() },
  options: { force: z.boolean() },
  handler: () => {},
});

defineCommand('items [sku]', {
  // @ts-expect-error — path declares `[sku]` but params object is empty
  params: {},
  options: { force: z.boolean() },
  handler: () => {},
});

defineCommand('items [sku] edit', {
  options: { mode: z.enum(['basic', 'full']) },
  handler: (ctx) => {
    expectTypeOf(ctx.options).toEqualTypeOf<{ mode: 'basic' | 'full' }>();
    expectTypeOf(ctx.params).toEqualTypeOf<Record<string, never>>();
    expectTypeOf(ctx.parents['items [sku]'].options).toEqualTypeOf<{ force: boolean }>();
    expectTypeOf(ctx.parents['items [sku]'].params).toEqualTypeOf<{ sku: string }>();
  },
});

// @ts-expect-error — 'totally made up' is not a key in CommandRegistry
defineCommand('totally made up', { options: {}, handler: () => {} });

expectTypeOf<'totally made up path'>().not.toMatchTypeOf<keyof CommandRegistry>();
expectTypeOf<'users create'>().toMatchTypeOf<keyof CommandRegistry>();

// User-registered Cli context flows into every handler's ctx via intersection.
import { createCli } from '#index.ts';

declare module '#index.ts' {
  interface CommandRegistry {
    'ctxhost open': {
      parents: {};
      root: { options: {} };
    };
  }
}

const ctxCli = createCli({
  programName: 'ctxhost',
  tree: { segment: null, command: null, literalChildren: {}, paramChild: null },
  context: {
    files: { creds: { read: async () => null as { token: string } | null } },
    tag: 'demo' as const,
  },
});

declare module '#index.ts' {
  interface Register {
    cli: typeof ctxCli;
  }
}

defineCommand('ctxhost open', {
  options: { force: z.boolean() },
  handler: async (ctx) => {
    expectTypeOf(ctx.options).toEqualTypeOf<{ force: boolean }>();
    expectTypeOf(ctx.tag).toEqualTypeOf<'demo'>();
    const creds = await ctx.files.creds.read();
    expectTypeOf(creds).toEqualTypeOf<{ token: string } | null>();
  },
});
