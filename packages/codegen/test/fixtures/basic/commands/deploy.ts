import { defineCommand } from '@parsh/core';
import { z } from 'zod';

export const args = { env: z.enum(['staging', 'prod']) };

export const command = defineCommand('deploy', {
  args,
  handler: (ctx) => {
    console.log(`deploying to ${ctx.args.env}`);
  },
});
