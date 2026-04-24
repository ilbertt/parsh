import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const args = { limit: z.coerce.number() };

export const command = defineCommand('users list', {
  args,
  handler: (ctx) => {
    console.log(`list ${ctx.args.limit} from ${ctx.args.workspace}`);
  },
});
