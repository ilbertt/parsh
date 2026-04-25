import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('configure', {
  description: 'Persist access/secret keys to disk for later use.',
  options: {
    'access-key': z.string().min(1),
    'secret-key': z.string().min(1),
  },
  handler: async ({ options, files }) => {
    await files.credentials.write({
      accessKey: options['access-key'],
      secretKey: options['secret-key'],
    });
    console.log(`wrote ${files.credentials.path}`);
  },
});
