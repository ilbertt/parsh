import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('admin', {
  options: { role: z.enum(['ops', 'super']) },
  handler: ({ options }) => {
    console.log(`role=${options.role}`);
  },
});
