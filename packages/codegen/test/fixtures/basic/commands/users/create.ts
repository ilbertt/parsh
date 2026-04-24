import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users create', {
  args: { email: z.string() },
  handler: (ctx) => {
    console.log(`create ${ctx.args.email} in ${ctx.parents.users.args.workspace}`);
  },
});
