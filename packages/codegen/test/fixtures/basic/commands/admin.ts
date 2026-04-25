import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('admin', {
  options: { role: { schema: z.enum(['ops', 'super']), forwardToChildren: true } },
  handler: ({ options }) => {
    console.log(`role=${options.role}`);
  },
});
