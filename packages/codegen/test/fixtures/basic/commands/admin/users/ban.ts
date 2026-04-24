import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const args = { reason: z.string() };

export const command = defineCommand('admin users ban', {
  args,
  handler: (ctx) => {
    console.log(`ban ${ctx.args.reason} by ${ctx.args.role}`);
  },
});
