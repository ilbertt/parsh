import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users', {
  options: { workspace: z.string() },
  handler: (ctx) => {
    console.log(`workspace=${ctx.options.workspace}`);
  },
});
