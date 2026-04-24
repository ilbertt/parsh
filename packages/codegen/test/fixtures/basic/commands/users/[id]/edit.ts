import { defineCommand } from '@parsh/core';
import { z } from 'zod';

export const args = { mode: z.enum(['basic', 'full']) };

export const command = defineCommand('users [id] edit', {
  args,
  handler: (ctx) => {
    console.log(`edit ${ctx.params.id} mode=${ctx.args.mode}`);
  },
});
