import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users [id] edit', {
  options: { mode: z.enum(['basic', 'full']) },
  handler: (ctx) => {
    console.log(`edit ${ctx.parents['users [id]'].params.id} mode=${ctx.options.mode}`);
  },
});
