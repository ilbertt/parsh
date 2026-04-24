import { defineCommand } from '@parsh/core';
import { z } from 'zod';

export const args = { workspace: z.string() };

export const command = defineCommand('users', {
  args,
  handler: (ctx) => {
    console.log(`workspace=${ctx.args.workspace}`);
  },
});
