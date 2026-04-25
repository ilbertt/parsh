import { z } from 'zod';
import { createFilesContext } from '#index.ts';

const credsSchema = z.object({ accessKey: z.string(), region: z.string() });

async function readReturnType() {
  const files = createFilesContext({
    basePath: '/tmp',
    files: { creds: { filename: 'creds.json', schema: credsSchema } },
  });
  const a = await files.creds.read();
  a.accessKey;

  const b = await files.creds.maybeRead();
  // @ts-expect-error
  b.accessKey;
}

void readReturnType;
