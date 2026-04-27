import { defineRootCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineRootCommand({
  options: {
    stateFile: {
      schema: z.string().optional(),
      forwardToChildren: true,
      description: 'Path to the JSON file backing tasks and sessions.',
    },
  },
});
