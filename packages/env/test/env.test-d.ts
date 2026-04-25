import { z } from 'zod';
import { createEnvContext } from '#index.ts';

const credsSchema = z.object({ accessKey: z.string(), region: z.string() });
const portSchema = z.number().int().positive();
const nodeEnvSchema = z.enum(['development', 'production']);

// `default` must satisfy the schema's inferred output.
createEnvContext({
  source: {},
  vars: {
    creds: {
      schema: credsSchema,
      // @ts-expect-error — default missing the `region` field
      default: { accessKey: 'a' },
    },
  },
});

createEnvContext({
  source: {},
  vars: {
    creds: {
      schema: credsSchema,
      // @ts-expect-error — default has wrong field type
      default: { accessKey: 1, region: 'eu' },
    },
  },
});

// Inferred types: properties carry the schema's output type.
function inferred() {
  const env = createEnvContext({
    source: {},
    vars: {
      PORT: { schema: portSchema },
      NODE_ENV: { schema: nodeEnvSchema },
      CREDS: { schema: credsSchema },
    },
  });
  const port: number = env.PORT;
  const nodeEnv: 'development' | 'production' = env.NODE_ENV;
  const creds: { accessKey: string; region: string } = env.CREDS;
  void port;
  void nodeEnv;
  void creds;
}

void inferred;
