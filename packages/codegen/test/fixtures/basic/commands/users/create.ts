import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users create', {
  options: { email: z.string() },
  handler: (ctx) => {
    console.log(`create ${ctx.options.email} in ${ctx.parents.users.options.workspace}`);
  },
});
