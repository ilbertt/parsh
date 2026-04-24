import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('outer', {
  args: { port: z.number() },
  handler: () => {},
});
