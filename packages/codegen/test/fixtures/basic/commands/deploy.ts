import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const args = { env: z.enum(['staging', 'prod']) };

export const command = defineCommand('deploy', {
  args,
  handler: (ctx) => {
    console.log(`deploying to ${ctx.args.env}`);
  },
});
