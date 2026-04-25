import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('outer inner', {
  options: { port: { schema: z.string() } },
  handler: () => {},
});
