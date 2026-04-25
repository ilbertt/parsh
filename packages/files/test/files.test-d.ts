import { z } from 'zod';
import { createFilesContext } from '#index.ts';

const credsSchema = z.object({ accessKey: z.string(), region: z.string() });
const basePath = '/tmp';

// `defaults` must satisfy the schema's inferred output.
createFilesContext({
  basePath,
  files: {
    creds: {
      filename: 'creds.json',
      schema: credsSchema,
      // @ts-expect-error — defaults missing the `region` field
      defaults: { accessKey: 'a' },
    },
  },
});

createFilesContext({
  basePath,
  files: {
    creds: {
      filename: 'creds.json',
      schema: credsSchema,
      // @ts-expect-error — defaults has wrong field type
      defaults: { accessKey: 1, region: 'eu' },
    },
  },
});

// `read()` return type narrows from `T | null` to `T` when defaults are set.
async function readNarrowing() {
  const withDefaults = createFilesContext({
    basePath,
    files: {
      creds: {
        filename: 'creds.json',
        schema: credsSchema,
        defaults: { accessKey: 'd', region: 'eu' },
      },
    },
  });
  const a = await withDefaults.creds.read();
  // Should compile: no `null` in the union.
  a.accessKey;

  const withoutDefaults = createFilesContext({
    basePath,
    files: {
      creds: { filename: 'creds.json', schema: credsSchema },
    },
  });
  const b = await withoutDefaults.creds.read();
  // @ts-expect-error — `b` is `T | null`, must be narrowed first.
  b.accessKey;
}

// Touch the function so the file isn't pruned as fully unreachable.
void readNarrowing;
