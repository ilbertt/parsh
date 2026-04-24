import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('admin', {
  args: { role: z.enum(['ops', 'super']) },
  handler: (ctx) => {
    console.log(`role=${ctx.args.role}`);
  },
});
