import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const args = { port: z.number() };

export const command = defineCommand('outer', {
  args,
  handler: () => {},
});
