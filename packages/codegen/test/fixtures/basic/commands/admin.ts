import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const args = { role: z.enum(['ops', 'super']) };

export const command = defineCommand('admin', {
  args,
  handler: (ctx) => {
    console.log(`role=${ctx.args.role}`);
  },
});
