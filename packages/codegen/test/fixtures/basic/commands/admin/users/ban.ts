import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('admin users ban', {
  args: { reason: z.string() },
  handler: (ctx) => {
    console.log(`ban ${ctx.args.reason} by ${ctx.parents.admin.args.role}`);
  },
});
