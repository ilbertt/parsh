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

async function updateAcceptsPartial() {
  const files = createFilesContext({
    basePath: '/tmp',
    files: { creds: { filename: 'creds.json', schema: credsSchema } },
  });
  await files.creds.update({ accessKey: 'AKIA' });
  await files.creds.update({ region: 'eu' });
  await files.creds.update({});
  // @ts-expect-error — unknown key
  await files.creds.update({ unknown: 1 });
  // @ts-expect-error — wrong value type
  await files.creds.update({ region: 1 });
}

async function statefulHandleShape() {
  const files = createFilesContext({
    basePath: '/tmp',
    files: { creds: { filename: 'creds.json', schema: credsSchema } },
  });
  const stateful = await files.creds.load();
  stateful.value.accessKey;
  stateful.value.region;
  // @ts-expect-error — value is readonly
  stateful.value = { accessKey: 'a', region: 'b' };
  await stateful.set({ region: 'us' });
  await stateful.replace({ accessKey: 'a', region: 'b' });
  // @ts-expect-error — replace requires a full T
  await stateful.replace({ accessKey: 'a' });
  await stateful.reload();
}

function defaultsTyped() {
  createFilesContext({
    basePath: '/tmp',
    files: {
      creds: {
        filename: 'creds.json',
        schema: credsSchema,
        defaults: { accessKey: 'k', region: 'r' },
      },
    },
  });
  createFilesContext({
    basePath: '/tmp',
    files: {
      creds: {
        filename: 'creds.json',
        schema: credsSchema,
        // @ts-expect-error — defaults must match the schema's Output
        defaults: { accessKey: 'k' },
      },
    },
  });
}

void readReturnType;
void updateAcceptsPartial;
void statefulHandleShape;
void defaultsTyped;
