import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('admin users ban', {
  options: { reason: z.string() },
  handler: ({ options, parents }) => {
    console.log(`ban ${options.reason} by ${parents.admin.options.role}`);
  },
});
