import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const args = { port: z.string() };

export const command = defineCommand('outer inner', {
  args,
  handler: () => {},
});
