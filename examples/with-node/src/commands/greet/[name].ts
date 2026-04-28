import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('greet [name]', {
  description: 'Greet someone by name.',
  params: { name: { schema: z.string().min(1) } },
  options: {},
  handler: ({ params, print }) => {
    print.info(`hello, ${params.name}`);
  },
});
