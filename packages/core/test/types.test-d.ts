/** biome-ignore-all lint/complexity/noBannedTypes: empty-object shapes mirror the generated registry */
import { expectTypeOf } from 'bun:test';
import { z } from 'zod';
import { type CommandRegistry, defineCommand } from '#index.ts';

declare module '#index.ts' {
  interface CommandRegistry {
    deploy: {
      parents: {};
      rootOptions: { verbose: boolean };
    };
    users: {
      parents: {};
      rootOptions: { verbose: boolean };
    };
    'users create': {
      parents: { users: { options: { workspace: string }; params: {} } };
      rootOptions: { verbose: boolean };
    };
    'items [sku]': {
      parents: {};
      rootOptions: { verbose: boolean };
    };
    'items [sku] edit': {
      parents: { 'items [sku]': { options: { force: boolean }; params: { sku: string } } };
      rootOptions: { verbose: boolean };
    };
  }
}

defineCommand('deploy', {
  options: { env: { schema: z.enum(['staging', 'prod']) } },
  handler: ({ options, params, parents, rootOptions }) => {
    expectTypeOf(options).toEqualTypeOf<{ env: 'staging' | 'prod' }>();
    expectTypeOf(params).toEqualTypeOf<Record<string, never>>();
    expectTypeOf<keyof typeof parents>().toBeNever();
    expectTypeOf(rootOptions).toEqualTypeOf<{ verbose: boolean }>();
  },
});

defineCommand('users', {
  options: { workspace: { schema: z.string(), forwardToChildren: true } },
  handler: ({ options, parents }) => {
    expectTypeOf(options).toEqualTypeOf<{ workspace: string }>();
    expectTypeOf<keyof typeof parents>().toBeNever();
  },
});

defineCommand('users create', {
  options: { email: { schema: z.string() } },
  handler: ({ options, parents, rootOptions }) => {
    expectTypeOf(options).toEqualTypeOf<{ email: string }>();
    expectTypeOf(parents.users.options).toEqualTypeOf<{ workspace: string }>();
    expectTypeOf<keyof (typeof parents)['users']['params']>().toBeNever();
    expectTypeOf(rootOptions.verbose).toEqualTypeOf<boolean>();
  },
});

defineCommand('items [sku]', {
  params: { sku: { schema: z.string() } },
  options: { force: { schema: z.boolean(), forwardToChildren: true } },
  handler: ({ options, params }) => {
    expectTypeOf(params).toEqualTypeOf<{ sku: string }>();
    expectTypeOf(options).toEqualTypeOf<{ force: boolean }>();
  },
});

defineCommand('items [sku]', {
  // @ts-expect-error — `wrongName` is not the param the path declares
  params: { wrongName: { schema: z.string() } },
  options: { force: { schema: z.boolean() } },
  handler: () => {},
});

defineCommand('items [sku]', {
  // @ts-expect-error — path declares `[sku]` but params object is empty
  params: {},
  options: { force: { schema: z.boolean() } },
  handler: () => {},
});

defineCommand('items [sku]', {
  params: {
    sku: { schema: z.string() },
    // @ts-expect-error — 'extra' is not a param in the path 'items [sku]'
    extra: { schema: z.string() },
  },
  options: { force: { schema: z.boolean() } },
  handler: () => {},
});

defineCommand('items [sku] edit', {
  options: { mode: { schema: z.enum(['basic', 'full']) } },
  handler: ({ options, params, parents }) => {
    expectTypeOf(options).toEqualTypeOf<{ mode: 'basic' | 'full' }>();
    expectTypeOf(params).toEqualTypeOf<Record<string, never>>();
    expectTypeOf(parents['items [sku]'].options).toEqualTypeOf<{ force: boolean }>();
    expectTypeOf(parents['items [sku]'].params).toEqualTypeOf<{ sku: string }>();
  },
});

// @ts-expect-error — 'totally made up' is not a key in CommandRegistry
defineCommand('totally made up', { options: {}, handler: () => {} });

declare module '#index.ts' {
  interface CommandRegistry {
    forwardCheck: {
      parents: {};
      rootOptions: {};
    };
    'forwardCheck child': {
      parents: { forwardCheck: { options: { shared: boolean }; params: {} } };
      rootOptions: {};
    };
  }
}

defineCommand('forwardCheck', {
  options: {
    shared: { schema: z.boolean(), forwardToChildren: true },
    selfOnly: { schema: z.string() },
  },
  handler: ({ options }) => {
    expectTypeOf(options).toEqualTypeOf<{ shared: boolean; selfOnly: string }>();
  },
});

defineCommand('forwardCheck child', {
  options: {},
  handler: ({ parents }) => {
    // Only forwarded options leak into descendants — `selfOnly` is excluded.
    expectTypeOf(parents.forwardCheck.options).toEqualTypeOf<{ shared: boolean }>();
  },
});

// Aliases keep `defineCommand` as the entry point but pass `{ aliasOf: target }`
// with no other props. The alias's own param shape must mirror the target's at
// runtime; the type system enforces only that the target is a real registered
// path other than the alias's own.
declare module '#index.ts' {
  interface CommandRegistry {
    'items lookup [sku]': {
      parents: {};
      rootOptions: { verbose: boolean };
    };
    'items ls': {
      parents: {};
      rootOptions: { verbose: boolean };
    };
  }
}

defineCommand('items lookup [sku]', { aliasOf: 'items [sku]' });

defineCommand('items lookup [sku]', {
  // @ts-expect-error — alias target must be a different command
  aliasOf: 'items lookup [sku]',
});

defineCommand('items lookup [sku]', {
  // @ts-expect-error — alias target must be a registered path
  aliasOf: 'totally made up',
});

// @ts-expect-error — `options` is forbidden on the alias form
defineCommand('items lookup [sku]', {
  aliasOf: 'items [sku]',
  options: { force: { schema: z.boolean() } },
});

// @ts-expect-error — `handler` is forbidden on the alias form
defineCommand('items lookup [sku]', {
  aliasOf: 'items [sku]',
  handler: () => {},
});

// Paramless aliases are allowed too (paramless on both sides).
defineCommand('items ls', { aliasOf: 'deploy' });

defineCommand('items ls', {
  // @ts-expect-error — alias param shape (none) doesn't match target [sku]
  aliasOf: 'items [sku]',
});

defineCommand('items lookup [sku]', {
  // @ts-expect-error — target has no [sku] to receive the alias's param
  aliasOf: 'deploy',
});

declare module '#index.ts' {
  interface CommandRegistry {
    'items [name]': {
      parents: {};
      rootOptions: { verbose: boolean };
    };
    'i [sku]': {
      parents: {};
      rootOptions: { verbose: boolean };
    };
  }
}

defineCommand('i [sku]', {
  // @ts-expect-error — param names differ ([sku] cannot alias [name])
  aliasOf: 'items [name]',
});

expectTypeOf<'totally made up path'>().not.toExtend<keyof CommandRegistry>();
expectTypeOf<'users create'>().toExtend<keyof CommandRegistry>();

// User-registered Cli context flows into every handler's ctx.context.
import { createCli } from '#index.ts';

declare module '#index.ts' {
  interface CommandRegistry {
    'ctxhost open': {
      parents: {};
      rootOptions: {};
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
  options: { force: { schema: z.boolean() } },
  handler: async ({ options, context }) => {
    expectTypeOf(options).toEqualTypeOf<{ force: boolean }>();
    expectTypeOf(context.tag).toEqualTypeOf<'demo'>();
    const creds = await context.files.creds.read();
    expectTypeOf(creds).toEqualTypeOf<{ token: string } | null>();
  },
});

import {
  type BuiltInErrorCode,
  type CommandLoadError,
  type ExitFn,
  ExitSignal,
  type OnErrorHandlerCtx,
  type Print,
} from '#index.ts';

class NotLoggedIn extends Error {}
class RateLimited extends Error {
  readonly retryAfter: number = 0;
}

createCli({
  programName: 'errs',
  tree: { segment: null, command: null, literalChildren: {}, paramChild: null },
  errors: { NotLoggedIn, RateLimited },
  onError: ({ code, error, ctx, exit, print }) => {
    expectTypeOf(code).toEqualTypeOf<'NotLoggedIn' | 'RateLimited' | BuiltInErrorCode>();
    expectTypeOf(exit).toEqualTypeOf<ExitFn>();
    expectTypeOf(print).toEqualTypeOf<Print>();
    if (code === 'NotLoggedIn') {
      expectTypeOf(error).toEqualTypeOf<NotLoggedIn>();
      expectTypeOf(ctx).toEqualTypeOf<OnErrorHandlerCtx<Record<string, never>>>();
      // biome-ignore lint/style/noMagicNumbers: exit codes are intentional literals
      return exit(77);
    }
    if (code === 'RateLimited') {
      expectTypeOf(error).toEqualTypeOf<RateLimited>();
      expectTypeOf(ctx.context).toEqualTypeOf<Record<string, never>>();
    }
    if (code === 'LOAD') {
      expectTypeOf(error).toEqualTypeOf<CommandLoadError>();
      expectTypeOf(ctx).toEqualTypeOf<undefined>();
    }
    if (code === 'PARSE' || code === 'VALIDATION') {
      expectTypeOf(error).toEqualTypeOf<Error>();
      expectTypeOf(ctx).toEqualTypeOf<undefined>();
    }
    if (code === 'UNKNOWN') {
      expectTypeOf(error).toEqualTypeOf<Error>();
      expectTypeOf(ctx).toEqualTypeOf<OnErrorHandlerCtx<Record<string, never>>>();
    }
  },
});

// Returning a non-ExitSignal value other than void is rejected.
createCli({
  programName: 'errs',
  tree: { segment: null, command: null, literalChildren: {}, paramChild: null },
  // @ts-expect-error — must return void or ExitSignal
  // biome-ignore lint/style/noMagicNumbers: exit codes are intentional literals
  onError: () => 5,
});

// No `errors`: code union is just the built-ins.
createCli({
  programName: 'errs',
  tree: { segment: null, command: null, literalChildren: {}, paramChild: null },
  onError: ({ code }) => {
    expectTypeOf(code).toEqualTypeOf<BuiltInErrorCode>();
  },
});

expectTypeOf(new ExitSignal(0)).toMatchObjectType<{ readonly code: number }>();
