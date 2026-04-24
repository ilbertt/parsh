import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('deploy', {
  options: { env: z.enum(['staging', 'prod']) },
  handler: (ctx) => {
    console.log(`deploying to ${ctx.options.env}`);
  },
});
