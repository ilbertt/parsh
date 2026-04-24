import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users list', {
  args: { limit: z.coerce.number() },
  handler: (ctx) => {
    console.log(`list ${ctx.args.limit} from ${ctx.parents.users.args.workspace}`);
  },
});
