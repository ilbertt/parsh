import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createEnvContext, EnvMissingError, EnvValidationError } from '#index.ts';

describe('createEnvContext', () => {
  test('reads and coerces a present variable from the source', () => {
    const env = createEnvContext({
      source: { PORT: '3000' },
      vars: { PORT: { schema: z.number().int().positive() } },
    });
    // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
    expect(env.PORT).toBe(3000);
  });

  test('numeric and boolean coercion happen automatically — no z.coerce needed', () => {
    const env = createEnvContext({
      source: { COUNT: '42', FLAG: 'true' },
      vars: {
        COUNT: { schema: z.number() },
        FLAG: { schema: z.boolean() },
      },
    });
    // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
    expect(env.COUNT).toBe(42);
    expect(env.FLAG).toBe(true);
  });

  test('throws EnvMissingError on access when the variable is missing and no default is set', () => {
    const env = createEnvContext({
      source: {},
      vars: { DATABASE_URL: { schema: z.string() } },
    });
    expect(() => env.DATABASE_URL).toThrow(EnvMissingError);
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/);
  });

  test('throws EnvValidationError naming the variable on schema failure', () => {
    const env = createEnvContext({
      source: { PORT: 'not-a-number' },
      vars: { PORT: { schema: z.number().int().positive() } },
    });
    let caught: unknown;
    try {
      void env.PORT;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as EnvValidationError).variable).toBe('PORT');
  });

  test('falls back to default when the variable is missing or empty', () => {
    const missing = createEnvContext({
      source: {},
      vars: { PORT: { schema: z.number(), default: 8080 } },
    });
    // biome-ignore lint/style/noMagicNumbers: asserts the literal default declared above
    expect(missing.PORT).toBe(8080);

    const empty = createEnvContext({
      source: { PORT: '' },
      vars: { PORT: { schema: z.number(), default: 8080 } },
    });
    // biome-ignore lint/style/noMagicNumbers: asserts the literal default declared above
    expect(empty.PORT).toBe(8080);
  });

  test('source value takes precedence over default', () => {
    const env = createEnvContext({
      source: { PORT: '9000' },
      vars: { PORT: { schema: z.number(), default: 8080 } },
    });
    // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
    expect(env.PORT).toBe(9000);
  });

  test('access is lazy — unrelated invalid vars do not block reading valid ones', () => {
    const env = createEnvContext({
      source: { PORT: '3000' },
      vars: {
        PORT: { schema: z.number() },
        DATABASE_URL: { schema: z.string() },
      },
    });
    // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
    expect(env.PORT).toBe(3000);
    expect(() => env.DATABASE_URL).toThrow(EnvMissingError);
  });

  test('values are cached per key — schema validate runs at most once', () => {
    let calls = 0;
    const counted = z.string().transform((v) => {
      calls += 1;
      return v.toUpperCase();
    });
    const env = createEnvContext({
      source: { GREETING: 'hello' },
      vars: { GREETING: { schema: counted } },
    });
    expect(env.GREETING).toBe('HELLO');
    expect(env.GREETING).toBe('HELLO');
    expect(calls).toBe(1);
  });

  test('spec.name remaps the property to a different source variable', () => {
    const env = createEnvContext({
      source: { MY_APP_PORT: '4000' },
      vars: { port: { schema: z.number(), name: 'MY_APP_PORT' } },
    });
    // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
    expect(env.port).toBe(4000);
  });

  test('async schemas throw EnvValidationError explaining the limitation', () => {
    const asyncSchema = z.string().refine(async (v) => v.length > 0);
    const env = createEnvContext({
      source: { TOKEN: 'abc' },
      vars: { TOKEN: { schema: asyncSchema } },
    });
    expect(() => env.TOKEN).toThrow(EnvValidationError);
    expect(() => env.TOKEN).toThrow(/async/);
  });

  test('defaults to process.env when source is omitted', () => {
    const key = `__PARSH_ENV_TEST_${Date.now()}`;
    process.env[key] = '42';
    try {
      const env = createEnvContext({
        vars: { value: { schema: z.number(), name: key } },
      });
      // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
      expect(env.value).toBe(42);
    } finally {
      delete process.env[key];
    }
  });
});
