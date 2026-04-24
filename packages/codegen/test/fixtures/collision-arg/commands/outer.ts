import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('outer', {
  options: { port: z.number() },
  handler: () => {},
});
