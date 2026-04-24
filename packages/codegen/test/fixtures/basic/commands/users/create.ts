import { defineCommand } from '@parsh/core';
import { z } from 'zod';

export const args = { email: z.string() };

export const command = defineCommand('users create', {
  args,
  handler: (ctx) => {
    console.log(`create ${ctx.args.email} in ${ctx.args.workspace}`);
  },
});
