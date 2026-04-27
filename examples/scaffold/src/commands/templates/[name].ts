import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('templates [name]', {
  description: 'Operate on a single template.',
  params: { name: { schema: z.string() } },
  options: {},
});
