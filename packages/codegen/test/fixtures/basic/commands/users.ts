import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users', {
  args: { workspace: z.string() },
  handler: (ctx) => {
    console.log(`workspace=${ctx.args.workspace}`);
  },
});
