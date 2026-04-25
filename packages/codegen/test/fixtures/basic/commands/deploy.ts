import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('deploy', {
  options: { env: z.enum(['staging', 'prod']) },
  handler: ({ options }) => {
    console.log(`deploying to ${options.env}`);
  },
});
