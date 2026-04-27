import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('configure', {
  description: 'Persist access/secret keys to disk for later use.',
  options: {
    'access-key': { schema: z.string().min(1) },
    'secret-key': { schema: z.string().min(1) },
  },
  handler: async ({ options, context, print }) => {
    await context.files.credentials.write({
      accessKey: options['access-key'],
      secretKey: options['secret-key'],
    });
    print.success(`wrote ${context.files.credentials.path}`);
  },
});
