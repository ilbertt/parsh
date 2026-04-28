import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('greet', {
  description: 'Print a greeting.',
  options: {
    loud: {
      schema: z.boolean().default(false),
      description: 'Shout the greeting.',
    },
  },
  handler: ({ options, print }) => {
    const message = 'hello, world';
    print.info(options.loud ? message.toUpperCase() : message);
  },
});
