import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('[name] [name]', {
  params: { name: { schema: z.string() } },
  options: {},
  handler: () => {},
});
