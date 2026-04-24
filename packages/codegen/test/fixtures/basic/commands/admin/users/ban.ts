import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('admin users ban', {
  options: { reason: z.string() },
  handler: (ctx) => {
    console.log(`ban ${ctx.options.reason} by ${ctx.parents.admin.options.role}`);
  },
});
