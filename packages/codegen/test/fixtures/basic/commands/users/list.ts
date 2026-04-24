import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users list', {
  options: { limit: z.coerce.number() },
  handler: (ctx) => {
    console.log(`list ${ctx.options.limit} from ${ctx.parents.users.options.workspace}`);
  },
});
