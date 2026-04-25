import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('templates [name]', {
  description: 'Operate on a single template.',
  params: { name: z.string() },
  options: {},
});
